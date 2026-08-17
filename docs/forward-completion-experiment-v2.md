# 反向路线与正向补全对照实验 V2

## 结论

默认架构采用“精确反向后缀优先，显式缺口才启动有界里程碑 strict 正向连接器”。无引导正向搜索只保留为对照实验和受控回退，不作为默认搜索方式。

纯反向候选如果已能通过 rules-v1 strict 重放得到匹配的终局证明，就不运行连接器。反向候选如果只给出终局动作或中间义务，并且起点、里程碑、终点都绑定完整规则状态，才允许连接器补全中间合法动作。

## 三种模式

1. `pure_reverse_atomic`：严格按反向生成的原子动作序列枚举并执行。找不到请求动作时记录 unavailable，不能据此断言路线不可能。
2. `reverse_milestone_forward_connector`：以结构化位置、资源或动作可用性里程碑排序 legal action，再逐个调用 Host strict 转移。每个被预算省略的动作都计入 unresolved。
3. `unguided_forward`：同预算下按稳定动作键展开，作为分支成本基线；它不进入默认架构。

三种模式都只接受 Host 枚举出的动作，并由 strict executor 产生下一状态。实验为攻击动作指定最大成功骰，只证明一条具体 Chance 见证，因此 `chanceMassComplete=false`、`opponentResponseSetComplete=false`、`globalOptimalityProven=false`。

## 有限场景结果

focused verifier 使用三个 Pressure Point 微场景：直接近战刺杀、直接回合末得分、以及防守方先撤出中心再结束回合。

| 场景 | 纯反向 | 无引导正向 | 里程碑连接器 | 选择 |
| --- | --- | --- | --- | --- |
| 直接刺杀 | strict witness | strict witness | strict witness | 纯反向 |
| 直接得分 | strict witness | strict witness | strict witness | 纯反向 |
| 撤离后得分 | 无 end-turn 动作 | 26 次转移找到 witness | 4 次转移找到 witness | 里程碑连接器 |

撤离场景的严格见证为防守方 `run -> end_turn`。结算使进攻方从 `1:0` 得到 `+2` 到 `3:0`，随后 strict Steamroller 2026 终局事件确认其在对手回合计分后领先 3 VP。无引导搜索产生 24 个无用分支；里程碑连接器产生 2 个，同时明确记录 8 个被动作预算省略的 legal action。

## 启用与停止

连接器只在以下条件同时成立时启用：纯反向没有 strict 终局见证；完整规则状态和类型化里程碑界定两端；连接器在声明预算内取得 strict witness；遗漏动作被保存为 unresolved。

遇到状态或转移预算耗尽、前沿耗尽，或终局动作执行后没有产生请求终局时停止。找不到动作会回写缺失前驱义务；strict reject 只反驳对应的精确状态和动作；预算耗尽和动作遗漏不得升级为规则不可能或策略失败。

原始可复现实验记录见 `docs/research/forward-completion-experiment-v2-verification.json`。
