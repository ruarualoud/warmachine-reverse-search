# Warmachine 完整激活域真实开局 Canary V1

## 目的

在当前 100 点 Sepsira 六队 Mechanithrall Swarm 核心对 Fane Ashmael 的 `106` 模型严格开局上，验证 Ticket 20 新增的演员组×动作族游标是否能完整分页，而不把固定移动提议冒充连续域完备性。

## 输入

- 房间：`construction-cryx-recursion-screen-fane-ashmael-scenario-blender-balanced-collision-player1-e4937ca7b578`
- 房间存储 SHA-256：`a6bd217f8a4d10419107b09d9c663edb2e5f0161c178b469e0a153cf464595b8`
- 模型数：`106`
- 运行命令：`npm run canary:complete-activation-domain`
- 运行模式：每页一个完整激活组，即 `6` 个动作族槽；本轮不请求昂贵的全状态一次性 Host parity。

## 结果

| 指标 | 结果 |
| --- | ---: |
| 耗时 | `507364 ms` |
| 激活组 | `17` |
| 动作族 | `6` |
| 槽位 | `102/102` |
| 合法动作 | `577` |
| 严格拒绝 | `7341` |
| 动作唯一归槽 | `true` |
| 演员组×动作族分母闭合 | `true` |
| 全状态 Host parity | `null`，本轮未请求 |
| 完整离散分母 | `false` |
| 连续域债务 | `33` |
| 连续域完备 | `false` |
| 激活域完备 | `false` |
| Chance 质量写入 | `false` |

计划哈希为 `62387183d023d577a56bb2443ae5ff9dfce9f523287c2ff96e149af7b949b884`，本轮聚合收据哈希为 `b688eef166ed16b3ff4be3308af0a8e05b914f5a6d0dd3eabca6e36fa9665a59`。

## 解释

本轮证明当前真实开局的 `17×6` 离散槽都经过 Host 枚举，所有返回动作恰好归入一个槽，且预算停止可以从密封分页恢复。它没有执行全状态一次性 parity，因此不能把 `actorFamilySlotDenominatorComplete=true` 升级为 `discreteSlotDenominatorComplete=true`。

更重要的是，移动终点、路径类、Unit 联合摆放、非移动连续参数和转移稳定仍形成 `33` 条显式债务。玩家选择不按样本频次转成 Chance；Ticket 20 与真实 `Q_rule` 保持未完成。

最重的六模型 Unit 组单组约需 `50–101` 秒，其余小组多为 `5–12` 秒。运行时已避免按六个动作族重复 Host 枚举，并支持完成页作为恢复输入；后续生产执行仍应逐页持久化完整页收据。
