# Warmachine Steamroller 2026 终局语义官方资料核验

## 核验范围

- 核验日期：2026-08-12。
- 仅核验七个 Steamroller 2026 场景名称、固定轮次、Leader 终局、场景分差胜利、平分项及得分开始时机。
- 只使用 Steamforged/Warmachine 官方网页和仓库内保存的官方 Warmachine App 数据快照；不使用社区 Wiki、论坛、Discord、视频或其他二手资料。
- 本文是资料核验，不以项目执行器、测试、`PROJECT_MEMORY.md` 或既有研究笔记反推规则。

## 一手来源与可复核性

### S1：当前官方 PDF 商品页

- URL：<https://warmachine.gg/products/warmachine-steamroller-2026-pdf>
- 机器可读商品元数据：<https://warmachine.gg/products/warmachine-steamroller-2026-pdf.js>
- 2026-08-12 实测两个 URL 均返回 HTTP 200。
- 元数据可核验：商品 ID `8252763340857`，标题 `Warmachine: Steamroller 2026 Tournament (PDF)`，厂商 `Warmachine`，类型 `Free Resource`，状态 `available=true`。
- 限制：商品页确认这是当前官方 PDF，但 PDF 下载经过商品领取流程；公开页面本身没有展开完整规则正文，因此具体语义以下方官方 App 快照为证。

### S2：仓库内保存的官方 Warmachine App 快照

- 最新整合快照：`../warmachine_tool_v6_advanced/warmachine_data/decrypted/data core.json`
- SHA-256：`4d2d3346274c86dd7e5fe3af622373210e8d9ddbffa1dd388e0f47bfd411cf50`
- 本地快照时间：2026-05-19 00:25:56 +0800。
- 对应公开数据清单：`../warmachine_tool_v6_advanced/warmachine_data/_public20_update/bundleManifest.json`
- 清单版本：`versionId=40017`；清单 SHA-256：`afb1de49c9c60fcaeee61345d38d8afd8d241f1cc96ccb2836eb7ee3e581e88f`。
- 快照中的官方 publication：GUID `e0de9b38-c3c2-4621-a948-d9ceb44366f2`，名称 `Steamroller 2026`，`isLive=true`，`devNotes="Steamroller 2026 Actual"`。
- 便于逐行核验的只读导出：`../warmachine_tool_v6_advanced/warmachine_data/publications/other/steamroller_2026.txt`
- 导出 SHA-256：`992e499267cf37d705223fb980e7a524b9f5f274495883e35d59eae65ab3bf96`。
- 官方来源入口 URL：<https://warmachine.gg/products/warmachine-steamroller-2026-pdf>；官方商品页同时指向 Warmachine 的免费规则与 App 入口。本文的逐条正文证据来自上述本地官方 App 快照。

### 未采用的页面

- 历史发布 URL：<https://steamforged.com/blogs/brands/steamroller-2026>
- 该 URL 在 2026-08-12 已因站点迁移返回 HTTP 404，因此不把搜索引擎缓存摘要当作规则证据。

## 七个场景

所有场景行的官方来源 URL 均为 [Steamroller 2026 官方 PDF 页面](https://warmachine.gg/products/warmachine-steamroller-2026-pdf)，精确正文由 S2 官方 App 快照复核。

| 编号 | 官方场景名称 | 固定轮次限制 | 得分开始与结算窗口 | 分差胜利 | 状态与可核验证据 |
| --- | --- | --- | --- | --- | --- |
| 1 | Trench Warfare | 有；Defender 第七回合结束时游戏结束 | 从 Defender 第二回合开始，在每个玩家回合结束时计分；首个窗口是 Defender 第二回合结束 | 在对手回合计分后领先至少 3 VP，立即获胜 | **已确认**。S2 导出第 88–99 行；标题 segment `e4103e6e-58fb-4992-892d-1250c208a004`，规则 segment `06aa3882-d8d8-4d68-a936-2400cb4c3179`。来源 URL：[官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 2 | Two Fronts | 当前完整场景段没有 `Fixed Game Length` 条款；不能套用第七回合结束 | 同上；首个窗口是 Defender 第二回合结束 | 同上 | **已确认**。S2 导出第 103–112 行，随后已进入地图和 Scenario 3；标题 segment `ada62252-12c1-4f1b-8613-113ba158e27e`，规则 segment `56e4d5d5-17ee-46f6-9e10-1d30726f14b1`。来源 URL：[官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 3 | Wolves at Our Heels | 有；Defender 第七回合结束时游戏结束 | 同上；首个窗口是 Defender 第二回合结束 | 同上 | **已确认**。S2 导出第 116–129 行；标题 segment `dc4d74e9-e4bf-49ce-aa26-8f1279ac6a84`，规则 segments `24d1c2b3-ce96-4a06-8d32-893ee4ff1356`、`4cda43fd-7294-4d01-80e3-9b3512d284ff`。来源 URL：[官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 4 | Pressure Point | 有；Defender 第七回合结束时游戏结束 | 同上；首个窗口是 Defender 第二回合结束 | 同上 | **已确认**。S2 导出第 133–140 行；标题 segment `ab509340-ee5a-4608-b8c3-667fa1e8b651`，规则 segment `6516d519-1a25-449a-88c2-66ad522776f3`。来源 URL：[官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 5 | High Stakes | 有；Defender 第七回合结束时游戏结束 | 从 Defender 第二回合开始；该场景还明确在得分前处理 Light the Fuse，然后在回合结束窗口计分 | 同上 | **已确认**。S2 导出第 144–160 行；标题 segment `e3f9f502-09b8-4b01-9d3e-488d621756b4`，规则 segments `894b6462-cdc8-4665-b01c-fce965085e23`、`b26da9b7-8ceb-4989-8668-dd185730e3be`。来源 URL：[官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 6 | Fault Line | 有；Defender 第七回合结束时游戏结束 | 同上；首个窗口是 Defender 第二回合结束 | 同上 | **已确认**。S2 导出第 164–173 行；标题 segment `a40016e6-396f-4a3e-a3cb-772a07a86dd7`，规则 segment `526d4385-ea4b-43d0-abdd-6439b96b6cb0`。来源 URL：[官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 7 | Payload | 有；Defender 第七回合结束时游戏结束 | 从 Defender 第二回合开始，在回合结束时计分；场景目标的计分后移动另在该窗口处理 | 同上 | **已确认**。S2 导出第 177–189 行；标题 segment `68046166-95d1-499e-b14c-53f9449547b8`，规则 segments `34b73db2-c372-4d17-bdac-6fe0e5882ea8`、`af19d4d0-7185-43b9-aefb-1b5c9ca5c80e`。来源 URL：[官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |

### 场景数量与固定轮次结论

- **已确认**：官方包列出且只列出上述七个编号场景。S2 导出第 88、103、116、133、144、164、177 行分别给出 Scenario 1–7；第 266 行另明确该包包含七个场景。来源 URL：<https://warmachine.gg/products/warmachine-steamroller-2026-pdf>。
- **已确认**：六个场景有固定轮次，均在 Defender 第七回合结束；Two Fronts 是唯一没有该条款的场景。
- **已确认**：`There is no limit to the number of VPs` 只表示 VP 数量无上限，不能据此判断是否有固定轮次；六个固定轮次场景中有多个也同时写了 VP 无上限。

## 通用胜利与平分裁定

| 核验项 | 结论 | 状态与可核验证据 | 来源 URL |
| --- | --- | --- | --- |
| 刺杀胜利触发 | 当一名玩家拥有场上唯一仍在场的 Leader model 时，该玩家立即获胜。它不是“任意一个 Leader 被移除就自动判负”。 | **已确认**。S2 导出第 70–72 行；标题 segment `5669d3b7-c975-442a-9928-dadda843a8b7`，正文 segment `aa20ad61-7aea-43d5-8ad5-53f5d613d87b`。 | [官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 刺杀后的最后计分 | 游戏虽已结束，仍按最终棋盘再计一次 VP；该计分只影响记录，不能把已经确定的刺杀胜者改成场景胜者。 | **已确认**。同一刺杀正文 segment；S2 导出第 72 行。 | [官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 所有 Leader 同时毁灭 | 游戏结束，并使用平分项决定胜者。 | **已确认**。同一刺杀正文 segment；S2 导出第 72 行。 | [官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 所有 Leader 以非毁灭方式同时离场 | Steamroller 正文在这一分支使用的是 `simultaneously destroyed`，没有把所有其他 `removed from play` 原因一并写入该句。 | **无法从当前 Steamroller 官方材料确认可一概同判**。应结合核心规则的生命周期语义另行核验。 | [官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 场景分差胜利 | 七个场景都要求：在对手回合的计分完成后领先至少 3 VP，立即获胜。总 VP 达到某个绝对阈值并不是这里的条件。 | **已确认**。S2 导出第 90、105、119、135、146、166、179 行。 | [官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 得分开始时机 | 七个场景都从 Defender 第二回合开始，并在每名玩家的回合结束时结算。按正常先后手顺序，首个场景计分窗口是 Defender 第二回合结束；Attacker 第二回合结束不计分。 | **已确认**。S2 导出第 93、107、121、137、148/155、168、182 行。 | [官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 第 1 平分项 | 比较 Victory Points；较高者获胜。若相同，进入第 2 平分项。 | **已确认**。S2 导出第 74–78 行；位于通用 `Scenario Victory` 段。 | [官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 第 2 平分项 | 比较 Scenario Presence：统计仍在相关场景区域/场景地形内且具备潜在控制资格的剩余模型与单位点数，较高者获胜；正文还规定忽略无点数模型、inert warjack 和 wild warbeast，并给出各模型类型的计值方式。 | **已确认**。S2 导出第 79–86 行。 | [官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 固定轮次结束 | Trench Warfare、Wolves at Our Heels、Pressure Point、High Stakes、Fault Line、Payload 在 Defender 第七回合结束时结束；Two Fronts 无固定轮次条款。 | **已确认**。S2 导出第 99、129、140、160、173、189 行，以及完整 Two Fronts 段第 103–112 行。 | [官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 固定轮次结束后是否“显式调用”上述平分项 | 官方材料把两个平分项置于通用 Scenario Victory 部分，也给固定场景写了结束时点；但当前可读正文没有一句单独写明“固定轮次结束时按第 1/第 2 平分项裁定”。 | **无法从当前官方材料确认该显式链路**。不能仅凭执行器已有行为补写规则。 | [官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |
| 第 2 平分项仍完全相等后的结果 | 当前快照没有第 3 平分项，也没有明确一句把“Scenario Presence 仍相等”映射为 Tie。赛事部分确实允许上报 Win/Loss/Tie，但没有把这两段显式连接。 | **无法从当前官方材料确认**。S2 导出第 77–86、234、242、310 行。 | [官方 PDF](https://warmachine.gg/products/warmachine-steamroller-2026-pdf) |

## 对终局状态机的最小确定口径

以下内容均已由当前官方材料确认，可作为后续实现输入：

1. 场景集合固定为七个，且必须按场景分别携带固定轮次属性。
2. `Two Fronts` 不得继承其他六个场景的 Defender 第七回合终止条件。
3. 七场景首个常规计分窗口均是 Defender 第二回合结束。
4. 分差胜利只在对手回合的计分后检查，门槛是至少领先 3 VP。
5. 刺杀必须检查完整 Leader roster，确认胜方拥有唯一仍在场 Leader；刺杀后的最后 VP 不能改写胜者。
6. 所有 Leader 同时毁灭时进入平分项：先 VP，再 Scenario Presence；不能仅凭 Steamroller 该句把所有非毁灭离场原因自动并入。
7. 对“固定轮次怎样显式进入平分项”及“第二平分项仍相等后怎样裁定”，实现应保持待确认或 fail-closed，除非取得新版官方 PDF、官方勘误或官方裁定。

## 核验结论

- **已确认**：七个场景名称、每个场景的固定轮次状态、七场景统一的得分开始时机、统一的 3 VP 领先胜利条件、唯一 Leader 刺杀、所有 Leader 同时毁灭后的两级平分项。
- **已确认的重要差异**：只有 `Two Fronts` 没有固定第七回合结束条款，其余六个场景都有。
- **无法从当前官方材料确认**：所有 Leader 以非毁灭方式同时离场是否一概使用同一裁定、固定轮次条款对两级平分项的显式调用句，以及第 2 平分项仍相等后的确切游戏结果。
