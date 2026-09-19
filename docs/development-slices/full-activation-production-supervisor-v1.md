# 完整激活生产调度与可观测性纵切

状态：调度器已实现并排队；完整有限激活图仍在计算。

归属：Ticket 20 完整激活域，服务于 Cryx 对 Nyrro 首份固定场景报告。

## 问题

`run-fixed-raptor-complete-activation-bounded-epochs-v1.mjs` 只消费当前 checkpoint 中已经存在的 Chance/对手回应工作。它会清空当前根动作产生的工作，但不会继续展开 `nodeQueue` 中的后继决策节点，因此不能单独称为完整激活全量运行。

第一次大批量运行还暴露了两个运维缺口：父进程常驻全部大结果导致 4 GB 堆 OOM；阶段内没有正式心跳时，长分片看起来像卡死。

## 交付

`run-fixed-raptor-complete-activation-full-supervisor-v1.mjs` 在同一内容寻址 DAG 和 canonical checkpoint 上循环两类有界阶段：

1. 存在 Chance/回应工作时，启动一个并行 bounded epoch；成功发布 canonical checkpoint 后退出子进程并压缩该 epoch 结果。
2. Chance 队列为空时，启动一个有界串行 epoch，展开决策节点及动作工作；新产生的 Chance 工作在下一循环重新交给并行池。

调度器支持显式 Engine 根绑定、等待已有生产 PID 后无缝接管、单实例锁、最小剩余磁盘门、无进展失败关闭、可选循环预算，以及包含 canonical 计数和池内 chunk 进度的内建心跳。默认 `max-cycles=0`，即持续运行到 `searchFinished=true`；它不把预算停止、未解析规则或连续域债务解释成搜索闭合。

## 当前生产启动

- 证据根：`88229c360171-62368dc456a8`
- 已有根层生产：6 个 persistent workers，4 工作/chunk，256 工作/epoch，96 工作发布间隔。
- 全量 supervisor：等待已有 bounded-epoch supervisor 退出后接管同一 checkpoint；决策/动作阶段每次最多 24 工作。
- 日志：当前 `screen` 生产会话写入证据根下 `screenlog.0`；supervisor 事件名统一为 `full_activation_*`。

根 Chance/回应层已于 2026-09-18 完成 `11230/11230`，零 strict 失败、零根层 unresolved。第一次后继接管因隔离 Search worktree 的默认 Engine 相对路径不存在而在执行前失败；checkpoint 未受影响。显式绑定原生产 Engine 后，一个 `24` 工作恢复周期成功把待决策节点从 `1970` 降至 `1946`，同时暴露 `10` 个 Reposition/Channeler task-local dependency unresolved。后续生产按用户要求继续作缺口清点：这些分支保持未解析，其他分支继续运行，结果不升级为 strict 闭合。

## 完成条件

- 全量 supervisor 实际接管且继续产生 `full_activation_cycle_*` 心跳和 checkpoint。
- 所有决策节点、动作工作和 Chance/回应工作均被消费，或以明确 unresolved 债务保留。
- `searchFinished=true`；只有零 unresolved、零 strict failure 且全部节点到达 `expanded` 或 `activation_boundary` 时，才允许 `currentHostFiniteActivationGraphComplete=true`。
- 生成的完整激活报告继续保持固定局面边界，不升级为整局、军表或全势力最优结论。
