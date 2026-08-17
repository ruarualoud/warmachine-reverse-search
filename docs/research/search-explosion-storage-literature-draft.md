# 搜索爆炸的存储、去重与外存执行：文献证据草稿

## 状态与范围

- 研究日期：2026-08-11
- Wayfinder 研究票：`研究搜索爆炸的存储、去重与外存执行`
- 本文范围：只整理外存搜索、重复检测、并发提交、崩溃恢复、内容寻址和多标签/概率保存的文献证据。
- 本文不包含：106 模型真实状态、动作边、strict receipt、路线标签的本地体积测量，也不提供容量参数结论；这些由主线程独立完成。
- 结论口径：本草稿给出候选架构的正确性边界，不完成该 Wayfinder 票的有限 demo 门禁。

## 结论摘要

Warmachine 的 OR/AND/Chance 反向图不能把“同一规则状态”“同一路线”和“同一概率事件”当成同一种重复。文献支持的安全分层是：

1. **规则状态层**只对规范字节完全相同，或已有行为等价证明的状态做硬汇合。
2. **边和证明层**把动作、选择者、Chance 事件、概率、strict receipt 与终局证明后缀保存为不可变记录；状态汇合不能删除这些记录。
3. **路线标签层**为同一状态保留多条非支配标签。只有扩展算子满足相应的单调/保序条件，而且标签处于相同搜索上下文，Pareto 支配才是安全删除依据。
4. **外存层**优先采用批量顺序写、分区和精确的 Delayed Duplicate Detection（DDD），避免对磁盘做逐节点随机查表。DDD 只能延迟重复检测，不能降低正确性标准。
5. **并发层**可借鉴 Hash-Distributed A*（HDA*）的确定性 owner 分区，但哈希分发本身不提供原子去重、消息持久化、崩溃恢复或全局终止证明。
6. **内容寻址层**适合保存不可变对象和快照根，但哈希只是索引与完整性证据。exact/fail-closed 模式仍需规范编码、域分离、碰撞时逐字节复核和原子唯一提交。
7. **概率层**不能把 OR 路线的权重相加，也不能把重叠事件当作互斥 Chance 结果。Chance 质量只能在明确的随机事件分区内求和；共享状态可复用后继值，但事件来源和策略上下文必须保留。

因此，推荐方向是“**内存热前沿 + 磁盘不可变分段 + 分区批量精确去重 + 独立边/标签账本 + 事务化 checkpoint**”，而不是有限容量 transposition table、仅存短哈希、Bloom/bitstate 去重或只保留 frontier 的无来源实现。

## 复杂度记号

外存算法常用 Aggarwal-Vitter 两层 I/O 模型：`N` 是记录数，`M` 是内存可容纳的记录数，`B` 是一次连续块传输的记录数。单盘情形可写为：

- `Scan(N) = Theta(N / B)` 次块 I/O。
- `Sort(N) = Theta((N / B) log_(M/B)(N / B))` 次块 I/O，省略常数和极小规模边界。

[Aggarwal 与 Vitter 的原论文](https://doi.org/10.1145/48529.48535)给出了外部排序/置换的紧确 I/O 界，并说明外存瓶颈是块传输而非 CPU 比较。因此，把逐状态随机磁盘查找改为“追加、排序、归并、顺序扫描”是 DDD 的理论基础。

下文的 `V`、`E`、`L` 分别表示唯一规则状态、持久边和路线标签数量；它们不能互相替代。即使 `V` 因汇合显著下降，`E` 和 `L` 仍可能指数增长。

## 方法证据矩阵

| 方法 | 正确性前提 | I/O / 内存特征 | 适用边界 | 对 exact Warmachine 的判断 |
| --- | --- | --- | --- | --- |
| 外存排序/归并 | 记录有稳定全序键；归并比较完整键 | 扫描 `Theta(N/B)`；排序约 `Sort(N)` | 批次够大、顺序 I/O 可摊销 | 可作为精确 DDD 基础 |
| DDD | 同一批/相关历史批中的候选最终都进入精确比较；层/代价处理顺序不会漏旧重复 | 生成先顺序追加，周期性排序或哈希分区去重；多处理批内重复 | 层次清晰、可批量处理的隐式图 | 可用，但不能只比较短哈希或丢标签 |
| Structured Duplicate Detection | 抽象分区能保证潜在重复只需与有限相邻分区比较 | 减少随机 I/O；效果依赖局部性 | 有可靠高层抽象和图局部性 | 只能在分区覆盖性质被证明后使用 |
| Frontier search | 删除 Closed 后仍能阻止“leak back”；解路径可重建；问题满足算法的方向/代价条件 | 从保存全部已发现状态降到一个或少数 frontier 的宽度 | 路径可二次搜索重建、无需长期保存全部来源 | 不能直接承担审计图；可只用于临时展开层 |
| Transposition table | 命中后验证同一完整状态；缓存条目语义含深度/边界/上下文 | 固定 `O(T)` 内存，平均常数查找；替换会遗忘 | 排序、加速、允许重算 | 有界替换表不能作为 exact 已访问集 |
| HDA* | 每个状态有唯一稳定 owner；消息不丢；owner 精确去重；全局终止正确 | 总 RAM 分摊到 worker；跨分区边产生通信；异步会增加展开 | 分布式内存、状态处理足够重、哈希负载较均衡 | 可借鉴分区，不能直接提供持久 exact 提交 |
| 内容寻址 Merkle DAG | 规范编码稳定；对象不可变；引用进入哈希；碰撞可检测 | 存储与唯一对象/引用量成正比；顺序 pack/delta 可压缩 | 不可变快照、完整性、共享子图 | 可作对象层，不是状态等价证明 |
| Bloom/bitstate/hash compaction | 接受假阳性导致漏状态 | 极省内存 | bug hunting、近似覆盖 | 禁止作为 hard dedupe；只能做 exact store 前置缓存 |
| 精确唯一索引 + 原子 upsert | 唯一键正确；比较规范字节；提交具备原子性/隔离性 | 随机索引写或批量 merge；有 WAL/索引成本 | 并发 worker 汇合 | 可作为最终去重仲裁点 |
| 多目标标签算法 | 标签扩展满足适用的单调/保序性质；只删除真正被支配标签 | 每节点可有多个标签；最坏输出指数级 | 保留 Pareto 路线 | 必须采用，不能每状态只留一个 score |
| 概率双模拟/MDP 汇合 | 相同动作集合、终局/奖励和到每个等价类的转移概率 | 可减少状态，证明成本高 | 已证明 Markov 状态和等价商 | 未证明前只允许严格相同状态汇合 |
| d-DNNF / 来源半环 | OR 互斥、AND 可分解，或保留完整来源多项式 | 编译可能指数爆炸；编译后计数可线性 | 事件重叠消除、来源审计 | 可用于概率/来源子图，不保证全图压缩 |

## 外存图搜索与 Delayed Duplicate Detection

### 文献结论

[Korf 的 Best-First Frontier Search with DDD](https://cdn.aaai.org/AAAI/2004/AAAI04-103.pdf)指出，普通 best-first 搜索主要为了重复检测而保存 Open 和 Closed；磁盘随机访问太慢，因此 DDD 先把生成节点追加到文件，再周期性地用顺序磁盘访问去重。该工作把 DDD 与 frontier search 结合，并扩展到 A* 类 best-first 搜索。

[Korf 的后续 JACM 工作](https://doi.org/10.1145/1455248.1455250)进一步使用基于哈希分区而非全局排序的 DDD，在其实验问题上实现实践中的线性处理时间。这里的“线性”是特定分区、节点表示和问题结构下的实践结论，不是对任意有向、带标签 OR/AND/Chance 图的普适最坏界。

[Edelkamp、Jabbar 与 Schroedl 的 External A*](https://doi.org/10.1007/978-3-540-30221-6_18)在“隐式、无向、无权状态空间 + 一致启发式”等前提下，把 best-first、frontier 与 DDD 结合，报告 `O(sort(|E|) + scan(|V|))` 的 I/O 量级。Warmachine 图有选择者、随机边、历史标签和不对称动作，不能直接继承该复杂度保证；可以继承的是批量顺序 I/O 设计。

[Zhou 与 Hansen 的 Structured Duplicate Detection](https://aaai.org/Papers/AAAI/2004/AAAI04-108.pdf)不等待整层完成，而是用状态空间抽象分区，把重复检测限制到相关分区。其有效性依赖搜索图具有足够局部结构，以及抽象确实覆盖所有可能产生重复的分区关系。若 Warmachine 只按势力、轮次或模型数量分区，却不能证明同一规范状态的所有生成路径进入可比较分区，便可能漏重，不能 hard dedupe。

### 正确性前提

DDD 在 exact 模式下必须满足：

1. 每个候选都先可靠落入某个待去重批次；进程崩溃不能让“已确认生成、尚未归并”的记录消失。
2. 归并键是完整 `searchMemoKey` 或其“摘要 + 规范字节复核”，不能只用截断哈希。
3. 去重范围覆盖所有仍可能到达同一键的当前和历史层。只在本批内去重而不查已提交索引，会把跨批重复当成新状态。
4. 对同一状态的多条入边和路线标签执行集合并，而不是“保留任意一条节点记录”。
5. 如果搜索不是严格 BFS 层，或代价/概率标签能改善旧状态，就必须支持 reopen/label-correcting；“见过即丢”并不正确。
6. 一批被标记完成前，节点、边、标签、概率事件和 checkpoint 必须形成同一个可恢复提交边界。

### I/O 与内存边界

- DDD 把大量随机读写变成追加和 `Sort/Scan`，代价是重复候选在归并前仍占空间并可能被多次展开。
- 内存至少需要生成缓冲、归并缓冲、当前热前沿和索引缓存；磁盘至少需要尚未压缩批、已提交唯一节点、边、标签、WAL 与 checkpoint。
- 批次过小会退化成频繁小 I/O；批次过大则提高峰值内存、崩溃重放量和归并延迟。
- SSD 降低随机访问惩罚但没有消除写放大。LSM 类结构将随机写转成顺序层合并，其原始设计目标和代价可见 [O'Neil 等人的 LSM-tree 论文](https://doi.org/10.1007/s002360050048)：写吞吐提高的同时会引入多层查找、合并和写放大。

### Warmachine 适用判断

适合采用“按胜利相对层/绝对规则时点形成逻辑批次，再按完整键哈希分区、分区内排序归并”的 DDD。不能预设反向图天然是 BFS：同一回合内动作数量、触发窗口和资源成本不同，必须由明确的迭代加深层或单调搜索键定义批次。若不存在这样的单调键，DDD 仍可做存储去重，但不能用“旧层已关闭”作为删除旧状态或禁止 reopen 的依据。

## Frontier Search

[Korf、Zhang、Thayer 与 Hohwald](https://doi.org/10.1145/1089023.1089024)提出只保存 Open、删除 Closed，并通过单向或双向分治搜索恢复解路径。它把普通 BFS 的状态存储从整个已探索空间降低到问题空间的最大宽度附近，但路径恢复需要额外搜索，且节点还要保存防止回退的操作信息。

这对 Warmachine 有两个重要限制：

1. 本项目输出的不只是“一条最短路径”，还要保留所有候选的终局证明后缀、strict receipt、主动兑换、概率来源和训练归属。删除 Closed 后再重搜一条路径，无法自然恢复完整多标签审计图。
2. 经典 frontier 方法大量利用无向/可逆邻接、层次或一致代价结构。Warmachine 的摧毁/移除、feat 一次性使用、资源消耗和随机结果通常不可逆；不能靠简单 used-operator bit 阻止所有回退和重入。

因此 frontier search 可用于“热展开工作集只保留当前若干层”，但冷存储仍须保留不可变节点、边、标签和来源。把它作为唯一持久表示会违反 fail-closed 审计要求。

## Transposition Table 与哈希

### 能做什么

[Zobrist 的原始方法](https://doi.org/10.3233/ICG-1990-13203)用增量异或哈希为棋盘局面建立快速索引，并讨论了检索错误及辅助检测方法。Transposition table 可以避免重复计算、改善动作排序，并在固定内存中保存状态估值、深度和上下界。

典型表在内存中提供平均常数时间查找，空间为固定 `O(T)`。但是当表满后发生替换，或不同状态映射到同一槽位时，旧信息会被遗忘；深度、搜索窗口、当前行动方和历史规则字段不完整，也会让命中结果语义错误。

### 为什么不能作为 exact 已访问集

- 固定容量替换意味着“未命中”不等于“从未搜索”，只能导致重算，不能承担完整覆盖证明。
- 仅保存 64/128 位摘要存在碰撞可能。哈希碰撞概率很低不等于 fail-closed。
- [Stern 与 Dill 的 hash compaction](https://doi.org/10.1007/3-540-60385-9_13)明确允许非零概率遗漏状态，并可能漏掉验证错误；[Holzmann 对 bitstate hashing 的分析](https://spinroot.com/spin/Doc/fmsd98.pdf)同样属于用覆盖概率换空间。二者适合探索性 bug hunting，不适合规则真值或“没有其他分支”的声明。
- Bloom filter 的原始设计明确允许成员查询错误，[Bloom 1970](https://doi.org/10.1145/362686.362692)。安全用法只能是：Bloom 判定“肯定不存在”时省去 exact 查询；判定“可能存在”时继续查完整索引。把阳性直接丢弃会漏掉真实新状态。

### 可接受合同

哈希在本项目中只能承担候选定位：

1. 对固定 schema、固定数值编码、固定字段顺序的规范字节做域分离哈希。
2. hash 命中后比较对象类型、长度、静态规则凭据和完整规范字节。
3. 碰撞时保存为同 bucket 的不同对象，发出审计事件；不能覆盖或静默合并。
4. 内存 transposition table 只做热缓存；最终存在性由外存 exact index 仲裁。

## Hash-Distributed Search

[Kishimoto、Fukunaga 与 Botea 的 HDA*](https://doi.org/10.1016/j.artint.2012.10.007)让每个进程维护本地 Open/Closed，并通过全局哈希函数为每个状态指定唯一 owner；生成状态后发送给 owner，由 owner 统一重复检测。论文展示了最多 2400 个进程和 TB 级聚合 RAM 的扩展，但也报告搜索开销、通信、同步、负载不均和本地内存争用；异步顺序不保证与串行 A* 相同，进程数过大时额外展开可显著上升。

对 Warmachine 可继承的只有“稳定 owner 负责同键仲裁”：

- `owner = partition(searchMemoKey, partitionEpoch)` 必须确定且整个 checkpoint 周期不可漂移。
- 同一键的全部节点候选和标签增量必须发送给同一 owner。
- owner 必须用完整键复核并原子提交，不得把 hash bucket 本身当作相等证明。
- 消息至少一次投递时，提交必须幂等；最多一次但可能丢消息的传输不满足完整性。
- worker 全部空闲不代表搜索结束，还必须证明网络中没有在途工作。[Dijkstra-Scholten 的终止检测](https://doi.org/10.1016/0020-0190(80)90021-6)说明分布式扩散计算需要显式的消息/应答账，不能用本地队列空推断全局终止。

HDA* 原论文不是崩溃恢复协议。若 owner 崩溃后其未持久化 Closed、入队消息或标签更新丢失，搜索会漏分支；因此分布式执行只能建立在持久 inbox/outbox、事务提交和可恢复 checkpoint 之上。若暂时没有这些能力，应先采用单写者或分区单写者，而不是宣称并发 exact。

## 内容寻址 DAG 与不可变存储

[IPFS 原始设计](https://research.protocol.ai/publications/ipfs-content-addressed-versioned-p2p-file-system/benet2014.pdf)使用内容寻址块和 Merkle DAG 表达版本化对象；[Git 官方数据模型](https://git-scm.com/docs/gitdatamodel.html)同样用对象类型与内容的加密哈希命名对象。它们支持不可变共享、完整性校验和从根引用恢复可达子图。

对本项目，内容寻址适合以下拆分：

- `state object`：静态凭据摘要 + 规范规则状态字节。
- `edge object`：源/目标状态引用、动作、控制方、Chance event/outcome、概率和 strict receipt 引用。
- `route label object`：终局后缀、成本向量、主动兑换、策略上下文、来源和 unresolved mass。
- `checkpoint root`：本轮已提交分区、frontier manifest、WAL 位置、规则/Host/数据凭据和可达对象根。

正确性前提是：

1. 序列化必须规范化，否则语义相同但字节顺序不同会失去去重；语义不同但投影遗漏字段会错误汇合。
2. 对象类型和 schema 版本要进入 hash 域，避免不同类型同字节被误认为同一对象。
3. Merkle 引用只能证明“这些字节被引用”，不能证明两个 Warmachine 状态行为等价。
4. 加密哈希仍不是数学上的无碰撞函数。Git 已因 SHA-1 实际碰撞设计 SHA-256 迁移，[官方迁移规范](https://git-scm.com/docs/hash-function-transition.html)也说明对象名、引用和签名需要整体迁移。fail-closed 系统仍应在同摘要命中时复核完整规范字节。
5. Merkle DAG 天然适合无环引用。若搜索状态图可能同层循环或回到旧状态，不能把整个搜索图强塞进递归内容对象；应让状态和边分别不可变，以边表表达一般有向图，再由 checkpoint root 引用分段。

压缩方面，[Git pack 格式](https://git-scm.com/docs/gitformat-pack)展示了“内容 ID 索引 + 完整对象压缩 + delta 对象 + pack 校验和”的成熟模式。它证明增量压缩可与内容寻址共存，但 delta 深度会增加读取/恢复成本，且自包含 pack 必须包含依赖基对象。该模式是工程证据，不代表直接复用 Git 作为搜索数据库。

## 精确重复检测与并发原子提交

### 线性化边界

并发 worker 不能执行“查询不存在 -> 各自插入”两步非原子逻辑。最终 exact store 至少需要：

- 以 `(objectType, schemaVersion, fullDigest)` 为唯一索引候选；
- 冲突时读取并比较规范字节；
- 在同一事务内创建唯一状态对象、追加每一条独立边/标签、登记幂等提交 ID；
- 只有事务提交后才确认消息和推进 checkpoint 水位。

[PostgreSQL 官方 `INSERT ... ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html)保证在唯一索引仲裁下产生原子的 insert-or-update 结果；[唯一性检查说明](https://www.postgresql.org/docs/current/index-unique-checks.html)明确指出，把冲突检查与索引插入分开会有竞态。这个证据支持“唯一约束必须位于存储提交点”，不预先指定本项目一定使用 PostgreSQL。

若一次提交需要读取多个聚合值再更新概率/标签账，应使用可证明的原子操作或可串行化事务，并对序列化失败从头重试。[PostgreSQL 的 Serializable 文档](https://www.postgresql.org/docs/current/transaction-iso.html)说明已提交事务等价于某个串行顺序，同时应用必须准备重试序列化失败。单独的 snapshot/read-committed 读取不足以防止跨行 write skew。

### 幂等与概率防重

每个生成事实都需要稳定身份，而不是用状态键代替：

- `nodeProposalId = hash(parentExpansionId, operatorId, concreteChoiceId)`
- `edgeId = hash(sourceKey, actionReceipt, outcomeId, targetKey)`
- `chanceContributionId = hash(randomEventId, outcomeId, incomingRouteLabelId)`
- `labelId = hash(searchContext, terminalSuffix, costVector, provenance)`

这些标识的作用是让重试返回“已有同一事实”，而不是再次累计概率或复制来源。状态相同但来自两个真正不同且互斥的 Chance 历史时，`targetKey` 相同而 `chanceContributionId` 不同，两份概率质量都应保留；同一消息重送时 contribution ID 相同，只能计一次。

## 崩溃恢复、Checkpoint 与垃圾回收

[ARIES 原论文](https://doi.org/10.1145/128765.128770)建立了 write-ahead logging 下分析、重做和撤销的恢复框架。其核心启示是：数据页先落盘不等于事务已提交，恢复必须依据持久日志和提交状态判断哪些操作重做、哪些撤销。

[SQLite WAL 官方说明](https://sqlite.org/wal.html)展示了一个较小的正式实现边界：变更先追加到 WAL，带 commit marker 才提交，checkpoint 再把已提交事务转回主文件；崩溃后根据 WAL 的有效 commit frame 恢复。SQLite 同时说明 WAL 通常只有一个 writer，checkpoint 还会受到并发 reader 影响。该资料可用于定义单机原型的原子性预期，但不能据此声称已经获得多机容错。

Warmachine checkpoint 必须同时固定：

1. 规则、Host、数据、Steamroller packet 和规范 schema 的摘要。
2. 已提交不可变 segment 清单及其内容校验和。
3. 每个分区的已归并批次、水位、热前沿和在途/待确认工作。
4. 节点、边、标签、Chance contribution 和 strict receipt 的事务水位。
5. 未展开、预算截断、worker 失败和依赖漂移产生的 unresolved mass。

恢复后只能从最后完整提交根继续。存在以下任一情况时必须 fail closed：segment 校验失败、schema/规则凭据漂移、checkpoint 引用缺失、概率贡献无法去重、批次状态介于“已确认消息”和“未提交对象”之间。

垃圾回收只能从所有活动 checkpoint、最终报告和训练导出根做可达性标记后删除不可达对象。并发写入时直接清理“当前不可达”对象有竞态；[Git `gc` 官方文档](https://git-scm.com/docs/git-gc/2.43.0)专门说明并发写入与 prune 的损坏风险。第一版应采用世代/宽限期、冻结 segment 和 checkpoint pin，而不是边写边即时删除。

## 多标签路径与概率质量

### 多标签是语义需要，不是表现层附件

[Martins 的多准则最短路论文](https://doi.org/10.1016/0377-2217(84)90077-8)采用多标签方案保存非支配路径；后续的[精确 label-correcting 算法](https://doi.org/10.1287/ijoc.2021.1081)仍以求取非支配路径集合为目标。多目标最短路的 Pareto 输出在最坏情形可以指数增长，近年的精确算法因此采用 output-sensitive 分析，而不是承诺每个节点常数标签。

映射到 Warmachine：同一 `rulesStateKey` 下的不同终局后缀、概率、回合距离、资源余量、主动兑换、空间容错、对手覆盖和来源，不能压成一个 score。以下条件全部成立时才可删除标签 A：

1. A 与 B 的 `searchMemoKey`、终局目标、策略控制方和概率语义相同。
2. B 在所有声明保留维度上不劣于 A，并至少一维更优。
3. 后续扩展对这些维度满足保序性；否则当前支配关系可能在扩展后反转。
4. A 不承载独立 Chance 质量、独立 strict witness、独立主动兑换解释或训练来源。

不满足这些条件时只能将 A 冷存、降优先级或计入预算 unresolved，不能 hard delete。

### OR、AND、Chance 的聚合不同

- **OR** 表示策略控制方选择。不同动作是备选，不是同时发生的随机事件；不能把两个刺杀路线各自的成功率直接相加。
- **AND/对抗** 表示候选必须面对的一组对手回复或义务。未展开回复是 unresolved，不是自动通过；聚合通常取最坏值、全称证明或显式覆盖率，而不是概率求和。
- **Chance** 表示同一随机事件的互斥且完备 outcome 分区。只有这些 outcome 的质量可在该事件内相加，且总和必须为 1 或明确保留缺失的 unresolved mass。

当不同 Chance 历史汇合到同一完整规则状态时，可以复用“从该状态继续”的值计算，但不能删除入边事件身份。若要计算某一固定策略下到达该状态的 occupancy mass，可以对互斥历史求和；若事件集合可能重叠，就必须先证明互斥或保存符号来源，不能朴素相加。

[Green、Karvounarakis 与 Tannen 的 provenance semiring](https://doi.org/10.1145/1265530.1265535)用多项式式来源区分“不同推导相加”和“共同前提相乘”，说明共享结果不必丢掉推导来源。[Darwiche 关于 smooth deterministic decomposable NNF 的计数结果](https://doi.org/10.3166/jancl.11.11-34)则说明线性计数依赖结构条件：OR 分支确定/互斥、AND 子图可分解，并满足平滑等要求。它们适合设计 Chance 来源账，但若 Warmachine 子图没有这些性质，编译本身可能膨胀，不能把普通 DAG 当作天然可无重计数的概率电路。

### 状态汇合的概率前提

[Larsen 与 Skou 的概率双模拟](https://doi.org/10.1145/75277.75307)把概率过程等价建立在可观察行为与转移概率保持上；[多目标 MDP 模型检查](https://doi.org/10.2168/LMCS-4(4:8)2008)进一步表明，多目标策略可能需要随机化和记忆。对本项目意味着：

- 若规范状态遗漏了计分历史、一次性规则、待结算窗口、策略记忆或会改变未来选择的来源，两状态即使棋盘相同也不能概率汇合。
- 只有在相同行动集合、终局/收益、选择者语义，以及到每个等价类的概率分布均相同时，商状态才可保存原值。
- 当前阶段采用完整规范状态逐字节相同作为保守门；启发式相似、距离桶和阵型拓扑只用于排序。

## 不能用于 exact/fail-closed 主图的方案

以下方案可以作为探索性加速器，但不能作为主图的唯一真值来源：

1. **Bloom filter、bitstate hashing、hash compaction**：假阳性会把新状态误判为重复并永久漏掉。
2. **只存 Zobrist/短摘要的 transposition table**：存在碰撞和替换；无法恢复完整状态、边和来源。
3. **有界 replacement transposition table 充当 Closed**：被替换状态会重算，若再把 miss 当“未见”或 hit 当完整证明，会破坏覆盖声明。
4. **随机或不稳定 worker 分发**：同一状态可能由多个 owner 各自提交，概率和标签重复累计。
5. **HDA* 风格纯内存 owner + 非持久消息**：worker 崩溃可丢 Closed、在途工作和贡献账。
6. **只保留一个父指针的 frontier search**：无法保留汇合前的多条终局证明、主动兑换和训练来源。
7. **按 score 只留每状态一条路线**：多目标 Pareto 集可能有多个不可比较标签；单标量会删除有效策略。
8. **把 OR 路线概率相加**：策略选择不是互斥随机结果，会夸大成功率。
9. **把所有汇合 Chance 路径直接求和**：若路径共享随机变量或事件不互斥，会重复计数。
10. **仅凭内容摘要宣称对象相等**：哈希碰撞概率不是 fail-closed 证明，必须复核规范字节。
11. **未证明局部性的 Structured Duplicate Detection**：分区遗漏比较范围会留下跨分区重复。
12. **无 reopen 的层封闭 DDD**：非单调代价、改善标签或跨层回边会让更优/必要候选被丢弃。
13. **并发 `SELECT` 后 `INSERT`**：存在竞态，必须由唯一索引/事务或等价原子原语仲裁。
14. **无 checkpoint pin 的即时 GC**：并发写或仍被报告/训练引用的对象可能被误删。

## 文献支持的候选存储合同

这不是实现设计定稿，而是后续原型不得违反的最低合同：

1. **对象分离**：状态、边、路线标签、概率贡献、strict receipt、checkpoint 分开保存；状态去重不触发其他对象删除。
2. **双重相等检查**：稳定 SHA-256 类摘要用于分区/索引，同摘要后以类型、schema、长度和规范字节判等。
3. **不可变分段**：worker 顺序写候选 segment；segment 封存后有校验和，不原地修改。
4. **批量 exact merge**：按完整键分区排序，与已提交 exact index 归并；节点复用，边/标签/贡献按各自幂等 ID 并集。
5. **单一线性化点**：唯一索引或分区单写者决定新建/复用状态；消息确认晚于持久事务提交。
6. **热冷分层**：RAM 保存当前 frontier、归并缓冲、热点索引和 label queue；磁盘保存完整冷图与来源。
7. **概率事件账**：每个随机事件有明确 outcome 分区、概率总和、未解析质量和稳定贡献 ID；OR/AND 不进入 Chance 求和。
8. **多标签账**：每状态保存标签集合；支配删除附带规则、维度和来源证明，删除操作本身可审计。
9. **事务 checkpoint**：根记录全部 segment、分区水位、in-flight 账和依赖凭据；恢复只读取最后完整根。
10. **保守 GC**：从所有 pinned root 标记可达对象，经过世代宽限后回收；依赖凭据漂移时冻结旧图而非原地重解释。

## 对主线程容量模型的输入要求

主线程完成真实测量后，容量模型至少要分别代入：

- `V_d`：每层新唯一状态数。
- `G_d`：每层生成候选数；`G_d / V_d` 反映去重汇合收益。
- `E_d`：保留边数，包含被状态汇合的不同动作/事件边。
- `L_d`：非支配路线标签数及每状态标签分布，不能只用平均值掩盖长尾。
- `C_d`：Chance contribution 数与独立随机事件数。
- `S_state / S_edge / S_label / S_receipt`：规范序列化、压缩和索引后的真实字节。
- `W_merge`：segment 写入、归并、压缩和 GC 的写放大。
- `I_cross`：跨 owner 边比例、消息字节和负载倾斜。
- `R_reopen`：跨批改善/重开率，用于判断层封闭 DDD 是否成立。
- `T_recovery`：不同批次阈值下的崩溃重放时间。

比较完整 JSON 树、内存规范 DAG 和分层外存 DAG 时，必须以“相同节点、边、标签、概率和来源语义”为前提；少存了证明后缀或 unresolved mass 的方案不能算作等价压缩。

## 待由有限 Demo 证明的事项

文献不能替代本项目实证。后续 completion gate 至少还需证明：

1. 分层外存 DAG 与未压缩基准产生相同的唯一状态、边、标签、Chance 质量和来源集合。
2. 同一候选由多个 worker 并发、重复和乱序提交时，状态只建一次，但独立边/标签不丢，同一概率贡献不重复累计。
3. 在 segment 写入、归并、事务提交和 checkpoint 发布的不同时间点强制中断，恢复结果与无中断运行一致。
4. 人造摘要碰撞会进入逐字节复核并 fail closed，不会覆盖对象。
5. 依赖凭据漂移后旧 checkpoint 被拒绝或只读冻结，不会用新规则继续旧图。
6. 外存方案在微型题和 Cryx/Fane 固定题上显著降低峰值 RAM，且 I/O、写放大和恢复时间仍在声明预算内。
7. label 长尾与 unresolved mass 被完整报告；任何有界标签策略都明确属于近似/预算模式，不冒充 exact。

## 一手资料索引

- Aggarwal, A.; Vitter, J. S. *The Input/Output Complexity of Sorting and Related Problems*. CACM 31(9), 1988. [DOI 10.1145/48529.48535](https://doi.org/10.1145/48529.48535)
- Korf, R. E. *Best-First Frontier Search with Delayed Duplicate Detection*. AAAI 2004. [AAAI 正式 PDF](https://cdn.aaai.org/AAAI/2004/AAAI04-103.pdf)
- Korf, R. E. *Linear-Time Disk-Based Implicit Graph Search*. JACM 55(6), 2008. [DOI 10.1145/1455248.1455250](https://doi.org/10.1145/1455248.1455250)
- Korf, R. E.; Zhang, W.; Thayer, I.; Hohwald, H. *Frontier Search*. JACM 52(5), 2005. [DOI 10.1145/1089023.1089024](https://doi.org/10.1145/1089023.1089024)
- Zhou, R.; Hansen, E. A. *Structured Duplicate Detection in External-Memory Graph Search*. AAAI 2004. [AAAI 正式 PDF](https://aaai.org/Papers/AAAI/2004/AAAI04-108.pdf)
- Edelkamp, S.; Jabbar, S.; Schroedl, S. *External A\**. KI 2004. [DOI 10.1007/978-3-540-30221-6_18](https://doi.org/10.1007/978-3-540-30221-6_18)
- O'Neil, P. et al. *The Log-Structured Merge-Tree*. Acta Informatica 33, 1996. [DOI 10.1007/s002360050048](https://doi.org/10.1007/s002360050048)
- Zobrist, A. L. *A New Hashing Method with Application for Game Playing*. ICGA Journal 13(2), 1990，重印 1970 技术报告. [DOI 10.3233/ICG-1990-13203](https://doi.org/10.3233/ICG-1990-13203)
- Stern, U.; Dill, D. L. *Improved Probabilistic Verification by Hash Compaction*. CAV 1995. [DOI 10.1007/3-540-60385-9_13](https://doi.org/10.1007/3-540-60385-9_13)
- Holzmann, G. J. *An Analysis of Bitstate Hashing*. Formal Methods in System Design 13, 1998. [作者正式 PDF](https://spinroot.com/spin/Doc/fmsd98.pdf)
- Bloom, B. H. *Space/Time Trade-offs in Hash Coding with Allowable Errors*. CACM 13(7), 1970. [DOI 10.1145/362686.362692](https://doi.org/10.1145/362686.362692)
- Kishimoto, A.; Fukunaga, A.; Botea, A. *Evaluation of a Simple, Scalable, Parallel Best-First Search Strategy*. Artificial Intelligence 195, 2013. [DOI 10.1016/j.artint.2012.10.007](https://doi.org/10.1016/j.artint.2012.10.007)
- Dijkstra, E. W.; Scholten, C. S. *Termination Detection for Diffusing Computations*. Information Processing Letters 11(1), 1980. [DOI 10.1016/0020-0190(80)90021-6](https://doi.org/10.1016/0020-0190(80)90021-6)
- Benet, J. *IPFS - Content Addressed, Versioned, P2P File System*. 2014. [Protocol Labs 作者版本](https://research.protocol.ai/publications/ipfs-content-addressed-versioned-p2p-file-system/benet2014.pdf)
- Git project. *Git Data Model*, *Hash Function Transition*, *Pack Format* 与 *git-gc*. [数据模型](https://git-scm.com/docs/gitdatamodel.html), [SHA-256 迁移规范](https://git-scm.com/docs/hash-function-transition.html), [pack 规范](https://git-scm.com/docs/gitformat-pack), [GC 规范](https://git-scm.com/docs/git-gc/2.43.0)
- Mohan, C. et al. *ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging*. ACM TODS 17(1), 1992. [DOI 10.1145/128765.128770](https://doi.org/10.1145/128765.128770), [IBM Research 正式页面](https://research.ibm.com/publications/aries-a-transaction-recovery-method-supporting-fine-granularity-locking-and-partial-rollbacks-using-write-ahead-logging)
- SQLite project. *Write-Ahead Logging*. [官方规范](https://sqlite.org/wal.html)
- PostgreSQL project. *INSERT*, *Index Uniqueness Checks*, *Transaction Isolation*. [原子 upsert](https://www.postgresql.org/docs/current/sql-insert.html), [唯一性检查](https://www.postgresql.org/docs/current/index-unique-checks.html), [可串行化隔离](https://www.postgresql.org/docs/current/transaction-iso.html)
- Martins, E. Q. V. *On a Multicriteria Shortest Path Problem*. EJOR 16(2), 1984. [DOI 10.1016/0377-2217(84)90077-8](https://doi.org/10.1016/0377-2217(84)90077-8)
- Kergosien, Y. et al. *An Efficient Label-Correcting Algorithm for the Multiobjective Shortest Path Problem*. INFORMS Journal on Computing 34(1), 2022. [DOI 10.1287/ijoc.2021.1081](https://doi.org/10.1287/ijoc.2021.1081)
- Green, T. J.; Karvounarakis, G.; Tannen, V. *Provenance Semirings*. PODS 2007. [DOI 10.1145/1265530.1265535](https://doi.org/10.1145/1265530.1265535)
- Darwiche, A. *On the Tractable Counting of Theory Models and its Application to Truth Maintenance and Belief Revision*. JANCL 11, 2001. [DOI 10.3166/jancl.11.11-34](https://doi.org/10.3166/jancl.11.11-34)
- Larsen, K. G.; Skou, A. *Bisimulation through Probabilistic Testing*. POPL 1989. [DOI 10.1145/75277.75307](https://doi.org/10.1145/75277.75307)
- Etessami, K.; Kwiatkowska, M.; Vardi, M. Y.; Yannakakis, M. *Multi-Objective Model Checking of Markov Decision Processes*. LMCS 4(4), 2008. [DOI 10.2168/LMCS-4(4:8)2008](https://doi.org/10.2168/LMCS-4(4:8)2008)
