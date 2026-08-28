# 保证严格拒绝与中断恢复等价

Type: task
Status: resolved
Blocked by: 15
Part of: ../map.md

## Progress

- [x] `result.ok === false` 即使带 Host 收据也终止为失败；成功收据只进入 committed prefix，失败收据只进入 rejection evidence，状态停在最后一次成功提交处。
- [x] 建立密封 transition progress 与刺杀 primary/replay 两阶段进度；活动候选槽位在动作链完成前不推进，失败 transition 不能包装为 `in_progress`。
- [x] 批处理在同一 worker 修订中原子提交最终结果与中间进度。中间任务回到 `queued + searchProgress`，最终结果才进入 `completed`。
- [x] 生产 checkpoint 使用单写者锁、陈旧锁恢复、expected-hash 比较交换、fsync 与临时文件原子发布；未发布文件不会成为恢复入口。
- [x] 三个 SIGKILL 点（动作前、Host 返回后、checkpoint 发布前）均恢复到相同终态和回执序列；陈旧 CAS、并发写者与篡改进度全部失败关闭。
- [x] 当前 `58` 文件 Search 执行闭包 `e4c6ee84a502407ba5e352cd71921c80446a7e2f930150367bddcdf01f74d504` 已进入生产计划。真实 `78` 模型 Vordak/Talon 刺杀以 `5` 个 primary 和 `5` 个 replay transition 形成 `9` 个中间 checkpoint，逐步恢复与一次性执行得到相同报告 `d5a12478323594f4f1f0ec2af32a449392cc0ca7fe2f1151a5ed72c9198abed9`、终态、候选游标和动作收据。生产 v6 最终为 `43/64` 完成、`3` 个任务严格根、`21` 个明确延期，质量守恒。

## Question

怎样让 transition 级断点在成功、严格拒绝、超时和进程中断时保持原子语义，使恢复执行与不中断执行得到同一处置和同一已提交前缀？

## Acceptance

- `result.ok === false` 始终形成终止失败处置，即使 Host 同时返回拒绝收据。
- 只有成功 transition 的收据可进入已提交前缀；失败收据保存在拒绝证据通道。
- SIGKILL/超时发生在 action 前、Host 返回后和 checkpoint 提交前的测试均不会重放已提交动作或吞掉拒绝。
- 同一输入的一次性执行与所有中断点恢复执行具有相同终态、处置、游标和语义收据。
- checkpoint 写入采用单写者原子提交，临时文件或未发布结果不得被恢复器接受。
