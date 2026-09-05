# 计算概率对抗闭包与初始状态值区间

优化复核（2026-09-05）：见[全工单原理审计](../../../docs/research/ticket-search-principles-audit-20260905.md) 的 `OPT-08`。这是待实现/待验收的优化子任务，不改变下方历史完成范围；`Blocked by` 表示最终完成依赖，局部研究开发见报告的分阶段安排。

Type: prototype
Status: closed
Blocked by: 06, 07, 19
Part of: ../map.md

## Question

怎样把已闭合的刺杀/得分路线按初始军表、地图、部署、先后手和状态归并，并在 Chance 与对手选择下给出守恒、可解释的值区间，而不是把候选频次或构筑分数当作胜率？

## Acceptance

- 每个 Chance 节点保存条件概率和累计概率，成功、失败、裁剪和 unresolved 质量精确守恒。
- 对手选择按 AND/min 或声明的对抗合同求值；未展开回应保持上界，不默认为合作或失败。
- 等价初始状态共享规则计算但保留军表、地图、部署、路线、成本和终局来源标签。
- 只有概率、对手、假设和 strict replay 同时闭合的初始状态可以得到精确值；其它状态返回有证据的区间。
- 聚合“胜率”必须绑定用户声明或可证明的初始状态分布；否则逐格报告，不做自然率声明。

## Result

- 新增 `warmachine_initial_state_adversarial_value_set_v2`：每个对手回应保存成功、失败、低概率裁剪和 unresolved 的精确有理数质量；质量不守恒即回到 `[0,1]`。
- 对手回应按 `AND/min`，我方完整候选集按 `OR/max`。未展开对手回应不会被当作合作或失败，未展开我方候选保留值上界。
- 只有严格开局、完整候选集、Chance 守恒且闭合、完整对手回应、历史假设和 current-Host strict replay 全部闭合时，初始格才可标记 `strict_exact`；其它格列出缺失门并返回证据区间。
- 相同 strict opening 和相同求值证据共享一次规则计算，但每个军表、场景、地图、先后手、部署、路线、成本和终局来源标签仍独立保留。
- 无初始状态分布时禁止聚合；用户声明权重只产生“声明分布下的值区间”。本层即使收到外部自然分布候选收据，也不自行晋级自然胜率，必须另由独立验证层确认。
- 既有精确概率门禁继续通过：真实 strict 策略值 `1225/1296`，Chance/对手上下文、低概率质量、恢复和并行结果均守恒一致。聚焦 V2 夹具覆盖 `2` 个 exact、`5` 个 bounded 初始格以及规则计算复用。
- Ticket 06/07 真实工件已接入正式小夹具并通过本地来源逐哈希校验。两格当前都正确保持 `[0,1]`：Ticket 06 还缺紧凑全路线 replay 收据、候选/回应/Chance 闭包；Ticket 07 已有 `96` 边 strict replay 与 Ticket 19 历史绑定，但仍缺完整候选、回应和 Chance 闭包。
- 组合门禁为 `npm run verify:ticket08-adversarial-initial-values`。当前真实值报告 hash 为 `4720e9778262fd1689e5e02384fae596b11bade185e31d19c61bc5e0227a75c7`，值集合 hash 为 `12e5041ce30d3202f9a8e9ebbca9f13b978c3bc0b6f4a87bc2ff06ad2d90270d`。

## Scope Boundary

本工单关闭的是 OR/AND/Chance 值代数、质量守恒和闭包判定语义，不证明任一真实 100 点状态的完整合法动作域已经生成。动作/连续几何候选由 Ticket 20 负责，多回合对手与 Chance 实际展开由 Ticket 21 负责；缺少任一层时本工单必须继续输出区间。
