# 将真实得分终局根反推到合法开局

优化复核（2026-09-05）：见[全工单原理审计](../../../docs/research/ticket-search-principles-audit-20260905.md) 的 `OPT-07`。这是待实现/待验收的优化子任务，不改变下方历史完成范围；`Blocked by` 表示最终完成依赖，局部研究开发见报告的分阶段安排。

Type: prototype
Status: closed
Blocked by: 03, 04
Part of: ../map.md

## Question

怎样为固定题生成真实军表的得分胜利终局，并反推场景控制、计分时点、阻挡/争夺、历史比分和多回合动作到合法部署？

## Acceptance

- 至少覆盖 Two Fronts 的 Defender 第二回合后开始计分、对手回合结算后领先至少 3 VP 和双方不同得分来源。
- 得分元素、控制/争夺资格、单位完整性、建筑/地形排除和 Kill Box 等由 Host 结算，不由搜索侧估算。
- 一条任务专属得分路线反推到合法部署并独立 strict 重放，比分和计分历史逐步一致。
- 主动放弃得分、阻挡、占位、交换和进攻均可作为并列合法历史；策略偏好不得改变可达性。
- 未展开场景、位置、得分来源和对手回应保持公开 unresolved 质量。

## Result

- [x] 固定题的 round-3 Two Fronts 得分终局由 Host 结算为 `3:0 + 3:1 = 6:1`，随后沿四个历史回合边界反推到 `0:0` 合法开局；终局、逐回合比分和得分来源均由同一 strict replay 复核。
- [x] 唯一验收路线 `terminal-deployment-route-55eb14c0a5291d49e0f2e4a8a4a50505` 包含 `96` 条反向边，并以完整正向 strict replay hash `9645ba978d677c5e9d14cc38692daa6c090348c5ac7ffbd4f9378752ef904a49` 闭合。
- [x] 两方首回合均通过整方部署区、底盘不重叠、单位队形、附件距离和跨方不重叠检查；声明移动只使用乐观必要下界预筛，实际路线、碰撞、落点和时序继续由 Host strict 执行裁决。
- [x] 中断恢复 checkpoint 保存完整前沿、未解析、拒绝和预算处置账；重复恢复得到相同语义结果 hash `3378b549337cc7905af86f17e6f543ca7e44db8470853ecb082415f81d2a66cb`。
- [x] 本路线保留 `1248` 个 unresolved 和 `20` 个 rejected 分支；它只证明一个得分终局存在合法历史，不宣称概率闭包、自然胜率、策略优劣或全局最优。

验收报告：`../../custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/ticket07-score-root-to-opening-v1.json`。
