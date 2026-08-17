# 外存 DAG v1

## 边界

该模块只保存反向搜索候选和 strict Host 证据，不判断 Warmachine 合法性。状态、边、路线标签、概率贡献、strict receipt 和 unresolved 记录各有独立内容身份；状态汇合只共享状态正文及后继计算，不合并路线、意图、交换、来源或概率账。

每个 store 固定绑定：

- Project D Host receipt hash；
- 本地存储源码 hash；
- 搜索配置 hash；
- 分区数量、delta 深度和比例阈值。

打开旧 store 时发生任一漂移，旧图保持可读并冻结写入。它不能被当前运行继续解释或训练。

## 数据布局

```text
STORE.json                         固定绑定
objects/{kind}/{prefix}/*.json     gzip 内容对象
segments/candidates/*.segment      worker 不可变候选段
segments/indexes/pNNNN/*.index     分区精确索引世代
control/inbox/*.json               未确认 worker 提交
control/outbox/*.json              已归并、未必 checkpoint 的结果
control/acknowledged/*.json        checkpoint 后确认
checkpoints/*.json                 不可变 checkpoint manifest
checkpoints/CURRENT                原子替换的当前根
pins/*.json                        报告/训练导出的固定根
gc/transactions/*                  两阶段隔离与恢复
```

SQLite 不参与数据面。候选和索引均顺序写入；索引先按稳定内容摘要分区，再生成有界排序 run，并与历史索引做 k-way exact merge。

## 身份与校验

`state`、`edge`、`label`、`chance`、`receipt`、`unresolved` 使用域隔离 SHA-256。摘要输入包含对象种类、schema、Host receipt、规范字节长度和完整规范字节。

摘要命中后仍复核：

- 对象种类与 schema；
- Host receipt；
- 规范长度与规范摘要；
- 完整规范字节。

不可变 segment、exact index、merge manifest 和 checkpoint 另有独立身份与完整摘要。碰撞、内容漂移、缺失对象或损坏索引全部 fail closed。

## 状态编码

状态 ID 始终由完整重建状态计算。物理层在下列条件全部满足时保存 delta：

- 父状态属于同一 store；
- delta 链不超过配置深度，默认 `16`；
- gzip delta 不超过 gzip 全量的配置比例，默认 `25%`。

否则写新的 gzip 全量基对象。每次读取 delta 后都重新规范化并复核完整 state ID，因此父链、patch 或存储正文损坏不能产生“近似可读”状态。

## 提交协议

1. worker 顺序 append 候选并封存不可变 segment。
2. inbox 以稳定 `worker + batch` 身份发布；相同批次重复提交必须逐字节相同。
3. 单写者读取未确认 inbox，持久化内容对象，按分区生成排序 run，与当前 exact index 精确归并。
4. merge 结果先写不可变 outbox；此时 worker 尚未确认。
5. checkpoint manifest 绑定新索引、输入 segment、frontier、in-flight ledger、`V/G/E/L/C/U` 和 unresolved mass。
6. 原子替换 `CURRENT` 后才写 acknowledgment。

进程在任何一步终止时，恢复只认最后完整 `CURRENT`。已发布 outbox 可幂等续交；临时 segment、临时 merge 和没有 CURRENT 指针的 checkpoint manifest 均不改变图语义。

## 预算与未决质量

候选 writer 可限制记录数、segment 字节、运行时间、每状态标签数、磁盘上限和空闲磁盘下界。达到限制后停止接收该候选，并在同一 segment 追加聚合 `unresolved` 记录，保存原因、遗漏数量、代表 ID 和概率质量。

指标口径：

- `V`：唯一完整规则状态；
- `G`：状态提议总数；
- `E`：strict 动作边；
- `L`：独立路线标签；
- `C`：独立 Chance contribution；
- `U`：预算、缺失回复、规则未知等未决记录。

`U` 不参与失败计数，也不能被 Bloom filter、有限缓存或标签上限静默删除。

## 恢复与垃圾回收

恢复会验证当前 checkpoint、全部引用索引、对象存在性、当前输入 segment、pending inbox 和 outbox 摘要。异常使 store 冻结。

GC 从 CURRENT 和所有 pin 做标记。未标记对象/segment/index 默认必须连续跨过两个 checkpoint 世代才可清理。清理先把文件移动到 transaction quarantine，再写 COMMITTED：

- COMMITTED 前崩溃，恢复把文件移回原位；
- COMMITTED 后崩溃，恢复完成删除；
- 活动或固定根引用的文件从不进入隔离集合。

## API

主要入口由 `src/index.mjs` 导出：

- `createWarmachineExternalDagStore(root, binding)`；
- `store.createCandidateSegment()` / `writer.append()` / `writer.seal()`；
- `store.mergeInbox()` / `store.commitMerge()` / `store.mergeAndCheckpoint()`；
- `store.readState()` / `store.readContent()` / `store.contentRows()`；
- `store.recover()` / `store.pinCheckpoint()` / `store.collectGarbage()`；
- `store.summarize()`。

上层多层搜索只通过这些接口访问冷图，不应读取布局路径或复制完整 JSON 树。

## 当前证据

- 微型穷举图：[external-dag-micro-verification.json](research/external-dag-micro-verification.json)
- 106 模型三层 strict 小批：[external-dag-real-batch.json](research/external-dag-real-batch.json)
- 研究选择与容量基线：[search-explosion-storage.md](research/search-explosion-storage.md)

微型图与完整 JSON 树的状态、边、标签和概率集合逐项一致，并通过并发重复、乱序、worker kill、main kill、partial merge/checkpoint、碰撞、receipt 漂移和 GC 故障注入。106 模型样本的完整结果以测量文件为准；它证明存储/恢复合同，不证明策略最优或终局可达。
