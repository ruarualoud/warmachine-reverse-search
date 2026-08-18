# Ticket 05：任务内可恢复候选块合同

## 问题

当前 Ticket 05 已使用单任务串行批次，但一个刺杀任务内部仍可能枚举多个 actor、几何锚点和角度。若仅在整个任务完成时写 checkpoint，则单个“任务”仍会成为不可恢复的大块，违背资源受限下的渐进搜索要求。

本合同定义 **候选块（candidate chunk）**：一个任务内可独立验证、可原子提交、可在进程暂停后恢复的有限候选范围。候选块不是终局处置；只有所有适用候选块完成后，任务才能被严格物化、严格拒绝、任务级过滤、来源未决或输入无效。

## 适用范围

首批适用于 `unique_leader_assassination` 中坐标为：

- `actionRange=outside_direct_action_range_requires_prior_movement`；
- `lineOfSight=clear`；
- `resource=zero_available`；
- `lifecycle=both_rosters_complete`；
- 不带 Payload、Trench、High Stakes 或其他场景生命周期附加合同。

同一机制以后可扩展至 LOS、精确资源支付、控制权转移和损伤状态；每种扩展均须升级终局任务执行合同版本。

## 确定性候选顺序

候选顺序必须完全由下列不可变输入决定：

| 字段 | 要求 |
|---|---|
| `taskKey` | 绑定计划任务身份。 |
| `behaviorSignatureHash` | 绑定 roster、代表元、地图、部署、先后手和 Host receipt。 |
| `terminalTaskExecutionContractVersion` | 绑定适配器语义。 |
| `candidateEnumerationVersion` | 绑定 actor 排序、锚点、角度和动作选择规则。 |
| `actorPieceKeys` | 先按现有 `actorCandidates` 的确定性排序。 |
| `geometrySlots` | 每 actor 的 `anchorIndex`、`angleIndex`、动作范围带和攻击 profile 的有限序列。 |

初版移动前驱的几何域为 8 个锚点 × 32 个角度；`geometrySlotIndex` 按 actor、锚点、角度、攻击 profile 的词典序编号。任何改变锚点、角度、actor 排序或动作选择的修改都必须使旧进度 fail-closed。

## Checkpoint 进度记录

尚未完成的任务可含 `searchProgress`，但状态仍只能是 `queued` 或 `leased`；部分进度绝不能生成 completed result。

```json
{
  "schemaVersion": "warmachine_terminal_task_candidate_progress_v1",
  "taskKey": "…",
  "behaviorSignatureHash": "…",
  "terminalTaskExecutionContractVersion": "…",
  "candidateEnumerationVersion": "…",
  "candidateSetHash": "…",
  "nextGeometrySlotIndex": 16,
  "examinedSlotCount": 16,
  "chunkCount": 2,
  "acceptedCandidate": null,
  "filteredCandidateCount": 16,
  "lastChunkEvidenceHash": "…",
  "updatedAtMs": 0
}
```

`nextGeometrySlotIndex` 表示**下一未检查**槽位；所有此前槽位必须有其汇总证据哈希。`acceptedCandidate` 非空时仍需完成所需的严格主回放与独立回放，并在该任务的最终处置中封存。

## 块执行规则

1. 批执行器只租约一个任务；任务内执行器取固定 `maximumGeometrySlotsPerChunk`，建议初始为 8。
2. 先读取或创建密封 `searchProgress`；只枚举 `[nextGeometrySlotIndex, endExclusive)`。
3. 对每一候选只记录以下之一：几何/动作过滤、严格动作回放失败证据、可接受严格根候选。
4. 一个候选块结束后，先写入 progress artifact，再原子写入 checkpoint；更新后的任务回到 `queued`，并保留 progress。
5. 仅当 `nextGeometrySlotIndex === totalGeometrySlotCount`，或已得到并双重回放认证的严格根时，才调用最终结果记录并将任务设为 `completed`。
6. `paused_resource_guard`、进程重启或用户暂停只会保留 `queued + searchProgress`，不得转换为 `budget_deferred`、`strict_rejected`、`proposal_filtered`、`rules_unknown` 或 `input_invalid`。
7. 租约过期接管必须保留最后已密封的 progress；接管者从 `nextGeometrySlotIndex` 继续，绝不重置或跳过槽位。

## 审计与质量守恒

每个任务报告需新增：

| 字段 | 含义 |
|---|---|
| `candidateChunkDisposition` | `partial_progress` 或最终处置。 |
| `candidateSetHash` | 当前有限候选集合的封存哈希。 |
| `examinedSlotCount` | 已检查槽位数。 |
| `remainingSlotCount` | 未检查槽位数。 |
| `chunkEvidenceHashes` | 按游标顺序的块证据。 |
| `strictReplayCandidateCount` | 已完成双重回放的候选数。 |
| `candidateChunkMassConserved` | 已检查 + 未检查 = 总槽位。 |

批次报告必须将“部分进度任务”列为 `selected_in_progress`，而不是 `budget_deferred`。任务级和计划级质量守恒分别为：

```text
examinedSlotCount + remainingSlotCount = totalGeometrySlotCount
completed + selected_in_progress + selected_queued = selectedTaskCount
```

## 验收门

1. 一个需要先行移动的任务可在任意两个候选块之间停止，并从新进程恢复，最终产生与无中断基线相同的 final report hash 或同一严格根语义哈希。
2. 任何 candidate enumeration、Host receipt、construction receipt 或执行合同版本变化均拒绝旧 `searchProgress`。
3. 手工篡改 `nextGeometrySlotIndex`、候选集哈希或块证据哈希会使 checkpoint 审计失败。
4. 只有完整遍历且无合法路线时才允许 `proposal_filtered`；只有 Host 严格拒绝的路线才能为 `strict_rejected`。
5. 进度报告明确给出剩余槽位；不允许用部分搜索产生“不可达”“劣势”或“最优”结论。

## 与 Ticket 14 的关系

本合同是 Ticket 14 条件对局空间扩充的底层恢复模式。Ticket 14 将把本合同从几何候选推广至状态前沿、对称轨道、拓扑单元、支配剪枝和用户确认的场景矩阵格；但不会改变本合同的核心原则：**任何未消费的合法质量必须可见、可恢复且不得伪装为结论。**

## 当前诊断快照（2026-08-18）

v5 先行移动首轮定向执行表明，`matchup-terminal-task-b5de578bfa441af5556bf8528a9c9085` 已进入 `actor_geometry_start`，且在现实现中长期停留于同一任务内部的几何候选枚举阶段。该阶段尚未产生新的阶段日志，说明当前可观测粒度只到“开始枚举 actor 的几何候选”，还不足以区分：

1. 正在遍历 `8 × 32` 的锚点/角度槽位；
2. 在某个候选上反复触发高成本动作枚举；
3. 因任务内缺乏块级 checkpoint，导致即使是单任务批次也仍是不可分割的大块。

这证明下一步不能继续只依赖“单任务微批”，而必须把 `authoredGeometryForActor` 与其后续严格回放改为：

- **候选集合显式编号**：`candidateEnumerationVersion + candidateSetHash + nextGeometrySlotIndex`；
- **块级阶段日志**：至少记录 `actorPieceKey / geometrySlotIndexStart / geometrySlotIndexEnd / slotCountExamined / acceptedOrFiltered`；
- **块级原子提交**：每完成固定槽位数就写 progress artifact 与 checkpoint，而不是等整个任务结束；
- **最终处置门不变**：只有所有槽位消费完或某个候选完成双重严格回放后，任务才可转为 completed disposition。

在该机制落地前，长运行任务仍不得因资源或时间阈值被终止，也不得把“仍在枚举中的任务”重分类为 `proposal_filtered`、`strict_rejected`、`rules_unknown` 或 `budget_deferred`。
