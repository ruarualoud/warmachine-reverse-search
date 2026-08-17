# Steamroller 2026 终局与计分状态机研究

## 状态

- 研究日期：2026-08-10
- 最新规则包：Steamroller 2026，有效期为 2026-01-21 至 2026-12-31。
- 一手来源：Steamforged Games 的 [Steamroller 2026 发布说明](https://steamforged.com/blogs/brands/steamroller-2026)；本机官方应用数据抽取 [steamroller_2026.txt](/Users/rualoud/Downloads/codex_project/project-d/warmachine_tool_v6_advanced/warmachine_data/publications/other/steamroller_2026.txt)；内容哈希和来源信息见 [steamroller_2026.meta.json](/Users/rualoud/Downloads/codex_project/project-d/warmachine_tool_v6_advanced/warmachine_data/publications/other/steamroller_2026.meta.json)。

Steamforged 官方发布页说明 Steamroller 是 Warmachine 匹配赛的官方规则与场景包，并于 2026 年更新。应用数据包含七个正式场景及完整文本，因此本项目应先绑定 2026 包，而不是旧的通用 `scenario_v19` 语义。

## 通用终局

### 刺杀

官方文本规定：某玩家拥有场上唯一剩余的 Leader model 时立即获胜。游戏结束后仍按最终棋盘结算最后一次 VP，但这次结算不能把刺杀结果改成场景胜利。若所有 Leader 同时毁灭，使用平分判定。

最小刺杀证明至少需要：

- 所有 Leader 的身份、所属方和在场状态。
- 最后一个导致 Leader 离场的完整生命周期事件。
- 同一结算窗口内其他 Leader 是否同时离场。
- 终止时刻的完整棋盘，用于最后 VP 和记录值结算。
- 刺杀结果优先级，确保终局后 VP 不覆盖胜者。

### 场景得分

七个场景均使用相同的核心胜利条件：一方在**对手回合的计分完成后**领先至少 3 VP，立即场景获胜。它不是“总分达到 3/5”，也不是在自己回合一领先 3 分就立即获胜。

通用计分起点是 Defender 的第二回合。换成完整时间线：

1. Attacker turn 1：不计分。
2. Defender turn 1：不计分。
3. Attacker turn 2：计分尚未开始。
4. Defender turn 2 结束：第一个计分窗口。
5. Attacker turn 3 结束：下一计分窗口。

固定长度场景在 Defender 第七回合结束。先比较 VP；相同则比较 Scenario Presence，即仍在相关场景范围且有资格潜在控制的剩余模型/单位点数。Leader 记 10 点，Cohort 按卡牌点数，单位及附件按单位点数，Solo 按点数，多模型 Solo 还受共同范围要求。

### Kill Box 与时间

从 Attacker 的第二回合开始，若一方结束回合时其 Leader 完全位于己方桌边 12 英寸内，对手立即获得 2 VP。该得分也可能参与场景终止，所以终局状态机必须在正确的回合结束时点处理，而不能只在普通场景元素结算中处理。

## 七个场景

| 场景 | 主要计分 | 特殊历史状态 |
| --- | --- | --- |
| Trench Warfare | 目标 1；对手场景地形 2；己方场景地形 0；Cache 2 | Cache 是否已被移除；固定第七回合 |
| Two Fronts | 目标 1；场景地形 1；同时控制两己方 40mm +1；同时控制两己方 50mm +1 | 组合控制奖励 |
| Wolves at Our Heels | 目标 1；场景地形 1；独占第三 token 事件 3 | 双方 token、目标移动、一次性检查、动态 Kill Box |
| Pressure Point | 场景地形 1；中央 50mm 目标 2 | Defender 放置的旗帜/地形位置；固定第七回合 |
| High Stakes | 40mm 1；50mm/场景地形基础 1，倒计时归零后再 +1 | 每个元素 5 个倒计时、计分前 1d3、POW 14 魔法爆炸 |
| Fault Line | 目标 1；控制两个己方目标 +1；三个己方目标再 +1 | 同回合组合控制奖励 |
| Payload | 目标和场景地形各 1；将 50mm 运到目的地立即 3 | 目标逐次移动、已移除状态、Cohort 跟随移动 |

第一套固定基准建议使用 **Two Fronts**：它已经要求区分 40mm/50mm 控制资格、场景地形和组合奖励，但没有 High Stakes 的额外随机爆炸，适合先证明通用计分状态机。第二套压力测试再使用 **High Stakes** 或 **Wolves at Our Heels**。

## 场景元素资格

2026 规则不是统一的“一个模型在范围内就控制”：

- 50mm objective：Leader、Cohort 或 battle engine 可以 secure。
- 40mm objective：Leader 或完整 unit 可以 secure；仍在场的全部单位模型必须都在同一目标 3 英寸内。
- Scenario Terrain：Leader、Solo，或至少两个其他模型可以 secure。
- Cache：友军模型在 3 英寸内放弃 Combat Action，且没有敌方 contest，随后立即移除。
- Inert warjack、wild warbeast、autonomous monstrosity 和 disabled model 不能 secure；部分条文也排除其 contest。

这些资格必须成为类型化状态和能力关联，不能只依赖通用圆形区域控制。

## 推荐状态机

每次 `end_turn` 按以下顺序：

1. 记录结束回合方、绝对轮次和 Attacker/Defender 身份。
2. 检查 Kill Box 及立即得分。
3. 判断 Steamroller 计分是否已经开始。
4. 执行场景的计分前效果，例如 High Stakes 倒计时与爆炸。
5. 计算双方对每个元素的 secure/contest 和组合奖励。
6. 原子地写入本窗口的 VP ledger，防止重复结算。
7. 执行计分后效果，例如 Wolves token/目标移动或 Payload 移动。
8. 只对“刚结束的是其对手回合”的玩家检查 `scoreLead >= 3`。
9. 若是 Defender 第七回合结束且未产生其他终局，执行 VP 与 Scenario Presence 判定。
10. 切换回合；若 Leader 生命周期已产生刺杀终局，保留刺杀优先级并只追加最终 VP 记录。

## 最小证明字段

### 刺杀证明

```text
packetReceipt
leaderRoster[]
terminalLifecycleWindow
simultaneousLeaderRemovalSet
remainingLeaderSet
winnerSideKey
finalScoringSnapshot
strictTransitionReceipt
```

### 得分证明

```text
packetReceipt + scenarioKey
attackerSideKey + defenderSideKey
absoluteRound + activeSideKey + timingWindow
scoreBefore + scoringLedgerEntry[] + scoreAfter
secureContestSnapshot[]
scenarioSpecificState
scoreLeadAfterOpponentTurn
roundLimitTiebreakState
strictTransitionReceipt
```

## Project D 当前实现对照

### 已具备

- 2024/2025/2026 官方包和媒体资产均已在本地。
- rules-v1 已保存 packet、年份、Attacker/Defender、计分起点、计分历史和轮次上限。
- `steamrollerScoringStartStatus` 正确表达 Defender 第 2 回合、Attacker 第 3 回合起可计分。
- 已有 Kill Box、场景元素、Scenario Terrain、重复计分 ledger 和第七回合判定的执行框架。
- strict 模式对未映射场景文本能够产生 pending/reject 证据。

### 阻塞性差异

1. [warmachine-rules-v1.mjs](/Users/rualoud/Downloads/codex_project/project-d/scripts/warmachine-rules-v1.mjs) 当前 `addScenarioScore` 在一方总分达到 `victoryThreshold` 时终止，默认阈值为 5。Steamroller 2026 要求的是在对手回合计分后**领先至少 3 VP**。
2. 当前刺杀 helper 在一个显式 Leader 被毁灭或移除时直接产生 terminal；2026 文本要求判断该玩家是否成为场上唯一剩余 Leader，并处理所有 Leader 同时毁灭。
3. 七个场景的 token、倒计时、爆炸、组合奖励、目标移动和一次性检查尚未由统一 2026 状态机证明完整执行。
4. 通用元素控制不能自动证明 40mm、50mm、Scenario Terrain、Cache 的不同模型资格与完整 unit 条件。
5. 本地包验证器自身把 `exactScenarioRulesComplete` 标记为 `false`；官方规则库存仍列出 `todo_steamroller_2026_scenario_geometry`。因此现有绿色来源门禁只证明数据存在，不证明 2026 场景执行完整。

## 对下一张 Wayfinder 票的约束

- 完整状态必须包含计分历史和场景专属可变状态，不能只保存当前 VP。
- 胜利相对时间必须同时绑定绝对 Attacker/Defender 轮次。
- 两个棋盘快照只有在场景 token、倒计时、目标位置、一次性事件和 scoring ledger 也相同时才能合并。
- 在上述 Host 差异修复或 strict fail-closed 前，得分终局只能生成候选义务，不能签发 strict 场景胜利见证。
