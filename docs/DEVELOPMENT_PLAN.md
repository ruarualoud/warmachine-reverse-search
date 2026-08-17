# 后续开发计划

## 总览

Wayfinder 共 `13` 个工单。当前状态：`01–04` 完成，`05` 进行中，`06–13` 未完成。推荐关键路径：

```text
05 -> (06 + 07) -> 08 -> 09
                  |      |
                  +----> 10
05 + 08 + 10 -----> 11
03 + 04 + 05 -----> 12
09 + 10 + 11 + 12 -> 13
```

## 已完成

### Ticket 01：终局需求与军表路由

建立有限终局需求组、`13` 个构筑宏型和 Force Builder 合法军表路由。评分只排序，不提供胜率或可达性。

### Ticket 02：首个真实终局根

用完整 `100/100` Sepsira/Hysene 军表执行一个第二回合刺杀根，保存生命周期选择和拒绝回放。它没有证明从部署可达。

### Ticket 03：通用任务与精确配装

支持任意阵营、领袖、固定核心、逐副本配装、附件、战斗群、点数、场景和预算，并保留遗漏/拒绝/去重质量。

### Ticket 04：Host 规则缺口回流

建立 source/Host/atom/interaction gap 分类、定向失效和修复回流；已用 Rampant Fury、Feast/Frenzy 缺口验证流程。

## 当前工单

### Ticket 05：批量终局根物化

当前可信生产基线：计划 `b8bd842761ff3ece6560b3cb4d59323214b08be74d3dcbcada5c4cbbd9d5a3a2`，checkpoint `d1bfd77088e9304c630158ad36b695b3335727e24fbf54c1c367b368407c58bb`，完成 `37/64`。

已闭合得分 `11/11`、固定轮次 `13/13`；刺杀 `3/24`、同时胜负 `10/16`。处置为 strict root `12`、strict reject `2`、候选过滤 `17`、来源未决 `6`、预算延迟 `27`。

交接工作树新增六个 Gorman/Experimental Warhead 任务适配，包括 terrain/model LOS、RFP history、one-focus、channeled Excarnate、full-health 和 Stealth 过滤审计。只验证了 terrain-blocked 任务 `matchup-terminal-task-d3eddbffd6f093feebd6b96874a7c54b`，结果为 `line_of_sight_blocked` strict reject；其余五项未验证。

下一步：

1. 先处理当前 Engine `380/466` 相对已审阅 `378/463` 的规则集漂移；旧 checkpoint 不得跨 receipt 恢复。
2. 分别用 `--task=<key>` 运行剩余五项，修复实际失败。
3. 运行更新后的 Gorman 六项聚合 verifier。
4. 运行 simultaneous 全 `13` 项和批次 `64` 项守恒门。
5. 生成新 checkpoint；只有验证后才更新完成数。
6. 补齐剩余刺杀 `21` 项和同时胜负 `6` 项适配器，或明确分类为 Host reject/source unresolved。

完成门：`64/64` 有精确处置；所有需求组/宏型/场景质量守恒；checkpoint 可恢复；Host receipt 漂移会拒绝旧结果。

## 后续工单

### Ticket 06：刺杀根反推到开局

选择一个任务专属 strict 刺杀根，恢复动作、激活顺序、移动路径、底盘碰撞、资源、Chance、反应和历史损失。至少一条 Cryx/Fane 路线与合法部署汇合，并从头独立 strict replay 到同一终局。

### Ticket 07：得分根反推到开局

以 Two Fronts 等真实场景恢复控制/争夺、计分时点、Kill Box、历史比分和多回合动作。至少一条合法部署到得分胜利路线逐步重放，且 Defender 第二回合后计分与领先 `3 VP` 胜利条件正确。

### Ticket 08：概率对抗闭包与初始值

实现条件概率质量守恒、AND/min 对手节点、未展开上界、初始状态归并和值区间。没有声明分布时禁止输出自然胜率。

### Ticket 09：固定题证据报告

覆盖 Fane 四名领袖、合法配装/军表、地图/部署/先后手、刺杀与得分路线。比较杀伤、控场、得分、反击后状态和续航，生成可点击证据的中文建议。

### Ticket 10：交互控制台

完成自定义任务、终局选择、人工种子 strict 审核、实时队列、暂停/恢复/取消、DAG/棋盘/时间轴/兄弟分支和值区间。使用真实地图和棋子；媒体缺失明确显示，不错误替换。

### Ticket 11：全阵营独有机制

建立 atom/hook 到搜索动作、终局需求和真实 strict 场景矩阵。覆盖 corpse/soul/hunger、focus/fury/frenzy、空投/预备队、多模型、可配装战兽/战甲、反应、替换/RFP 和场景机制；至少三个结构显著不同阵营完成端到端路线。

### Ticket 12：规则/数据增量更新

实现复合 receipt、语义影响索引和定向重建。用一次纯构筑变化、一次规则原子变化证明旧 checkpoint 拒绝、未受影响证据复用与报告更新。

### Ticket 13：产品完成门

提供一个聚合命令运行 focused、纵向、跨阵营、恢复、漂移和浏览器门。固定题至少有一条刺杀、一条得分的开局到终局 strict 路线；所有数值和未闭合质量可见，无超范围结论。

## 团队并行建议

- A 线：Ticket 05 适配器与批次守恒。
- B 线：Ticket 06 刺杀前驱和移动/激活连接器。
- C 线：Ticket 07 得分前驱与 Steamroller 历史。
- D 线：Ticket 10 报告/控制台，但只消费稳定 schema。
- Engine 线：只处理搜索暴露出的精确规则缺口，并提供正反 verifier。

并行分支不得同时改共享 schema；先在小 PR 固化 schema，再并行消费者。每个搜索 PR 必须记录 Engine receipt 和 focused 命令。
