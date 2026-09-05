# 闭合首个真实军表终局根与拒绝回放

优化复核（2026-09-05）：见[全工单原理审计](../../../docs/research/ticket-search-principles-audit-20260905.md) 的 `OPT-02`。这是待实现/待验收的优化子任务，不改变下方历史完成范围；`Blocked by` 表示最终完成依赖，局部研究开发见报告的分阶段安排。

Type: prototype
Status: resolved
Blocked by: 01
Part of: ../map.md

## Question

怎样把一个详细刺杀需求组、真实 `100/100` 合法军表、真实卡牌模型、后续回合位置和最终动作绑定成首个任务专属 strict 终局根，并让同一候选的 Host 拒绝可以按动作和规则原因复盘？

## Acceptance

- 从任务路由选择真实 Cryx/Fane 军表并物化完整合法部署，不使用两 Leader 微型投影或占位模型。
- 在不读取开局位置或正向路线的情况下，为双方全部存活模型生成后续回合合法坐标，并通过底盘、地形、单位编队、控制范围和 Host 静态审计。
- 至少一个第二回合 Two Fronts 刺杀终局由真实模型严格执行并独立重放；可选生命周期窗口必须明确使用或放弃。
- 每个失败候选保存相关拒绝动作、规则键、标记和最小上下文，且不把拒绝计为任务输局或不可达。
- 终局根写回详细需求组证据账，但 `deploymentToTerminalReachabilityProven` 与任务值继续保持未闭合。

## Current Evidence

- 当前任务哈希为 `d8fd2fc8...`，Host receipt 为 `9dcce05e...`；军表池、需求语料、路由和任务专属证据都必须同时绑定这两个版本，旧批次混入时物化器会 fail closed。
- 已物化 Sepsira 六队 Mechanithrall Swarm/六个 Warden 对 Hysene 的真实 `100/100`、`78` 模型第二回合 Two Fronts 终局位置；双方完整模型通过 Host 静态底盘、地形、单位编队和 Scenario Terrain 审计。
- Strygon 的 Claw 在零 Fury 下严格攻击一血 Sepsira；未提交 Feast 决策的候选以生命周期选择窗拒绝，明确放弃 Feast 的两步路线产生刺杀终局。第二次重放只读取前终局状态和动作见证，不读取首次 strict receipt，并到达相同终态哈希 `0308fff7...`。
- focused verifier 与需求分组、证据语料、军表路由、通用构筑覆盖门均通过；任务证据账为 strict 终局根 `1`、从部署可达路线 `0`、未展开代表 `2`，值区间仍为 `[0,1]`，无胜率与训练真值声明。
- 验收过程中修复了通用军表池把 Warjack 伤害网格和 Warbeast 生命分支误计为多个实体模型的问题；构筑池现在与 strict 开局的实体模型展开一致。
