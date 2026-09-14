# Fane of Nyrro 真实对局逐回合系统审计

日期：2026-09-14  
审计对象：Fane of Nyrro（Hysene）对 Orgoth Sea Raiders（Oriax），50 分  
结论级别：真实对局负向基准，不是最优策略证明

## 1. 证据与范围

本轮公开检索没有找到一场可完整复盘的当前版 Fane of Nyrro 对 Cryx
录像。选用的最接近完整案例是：

- [完整对局：Hysene 对 Oriax](https://www.youtube.com/watch?v=fCcgFwViCfE)
- [赛前军表与场景说明](https://www.youtube.com/watch?v=rwIxYKXBIhY)
- [Fane of Nyrro 官方页面](https://warmachine.gg/pages/dusk-fane-of-nyrro)
- [Tales from the Frontlines 官方发布说明](https://steamforged.com/en-eu/blogs/brands/tales-from-the-frontlines-out-now)
- [Tales from the Frontlines 官方 PDF](https://cdn.shopify.com/s/files/1/0602/0156/6449/files/WM-Steamroller-2026-TalesFromTheFrontlines_1__compressed_1.pdf)

另找到一场 [Hysene 对 Grymkin 的 100 分 Fault Line 对局](https://www.youtube.com/watch?v=mcZBQR7ZSHA)。
它的场景已在当前 Host 中，但 Grymkin 势力协议仍未认证，不能替代完整的
Nyrro 对 Cryx 基准。

录像提供了回合、激活顺序、玩家意图和多数规则选择，但俯拍画面不足以恢复
精确英寸坐标、底盘扫掠路径和每次量尺结果。因此本报告可以审计动作语义和
决策链，不能据此签发精确几何或全局最优收据。

## 2. 场景规则校准

对局使用 `Closed Quarters` 和随机条件 `Muddy Ground`。

- 从防守方第二回合开始，每名玩家回合结束时，按当前控制的每个目标和场景
  地形各得 1 VP。
- 仅在对手回合结束并完成得分后，领先至少 3 VP 的玩家获胜；玩家不能在自己
  的回合获胜。
- 模型进入粗糙地形或被放入粗糙地形时掷 d6，结果为 1 时必须放弃战斗行动。

赛前视频把胜利条件口述成“取得 3 VP”，这不精确；官方文本要求相对领先
3 VP。主视频中 Nyrro 在己方第二回合说“还不能得分”是正确的，因为防守方
第二回合尚未开始；Orgoth 第二回合结束后成为 `1:1`，与双方各控制一个元素的
叙述一致。

当前 Search/Engine 只暴露七个标准 Steamroller 2026 场景：`Trench Warfare`、
`Two Fronts`、`Wolves at Our Heels`、`Pressure Point`、`High Stakes`、
`Fault Line` 和 `Payload`。代码中没有 `Closed Quarters`、`Muddy Ground` 或
`Tales from the Frontlines`。因此当前系统不能合法初始化、结算或搜索这场
录像的原场景。

## 3. Nyrro 军表与构筑检查

录像中的 Nyrro 军表可重建为：

| 模型/单位 | 配装或数量 | 分数 |
| --- | --- | ---: |
| Hysene, the Executioner | Leader | 0 |
| Strygon | Muzzled / Claws / Blind Obedience | 5 |
| Sybaris | 固定配置 | 14 |
| Vordak | Lamprey / Feral / Razor Fan | 9 |
| Strygon Rider | 2 个 | 16 |
| Fane Knights | 1 队 | 6 |
| 合计 |  | 50 |

当前 Force Builder 对这套配置返回一个精确合法的 50 分军表，战兽归属也正确。
给 Fane Knights 追加录像中误摆的 Sythyss Prophet 后，当前构筑器以
`warmachine_fixed_core_exceeds_point_limit` 拒绝。录像玩家在第二回合移除该
附件并说明它不应存在；这是一个有效的构筑负向对照。

## 4. 逐回合审计

| 时间与回合 | 录像中的计划和动作 | 规则/策略判断 | 当前系统状态 |
| --- | --- | --- | --- |
| `02:40-05:12` Nyrro 1 | Hysene 先激活；给前方 Rider 施放 Storm Rager，施放 Dash；Hysene 与大部队快速前压。Muzzled Strygon 和 Fane Knights 留作 Shield Guard、Shadow Shift 锚点。 | 激活顺序有明确理由：Dash 必须先让后续友军受益。Dash 只影响友方阵营 warrior，不影响 warbeast。首轮 feat 缺少击杀触发和施法必要性，不使用合理。问题是“所有模型都尽量跑满”忽略了 Vordak 的 Razor Fan 射击备选，也没有证明每个终点相对敌方威胁最优。 | Dash、Storm Rager、run、Shield Guard、Shadow Shift、Fury/Hunger 均有执行路径；精确路线和对手威胁值无法由录像恢复。 |
| `05:16-09:01` Orgoth 1 | Orgoth 测量 Hysene、Rider 和 Echolocation 威胁，整体退到即时冲锋范围外；Champion 占旗，Ravener/Gnasher 留作反击，Tyrant 射击 Rider。 | 对手明确识别并破坏 Nyrro 的首轮诱饵计划。Nyrro 后续应把“对手没有接饵”作为新观测，而不是继续原计划。 | Nyrro 的 Echolocation、Shield Guard 和受击资源链可表达；Orgoth 的完整卡牌规则未闭环，不能严格重放本回合。 |
| `09:09-15:06` Nyrro 2 | 维持 Storm Rager；Hysene 进入中央 40/50mm 范围，保留 2 Fury、Shadow Shift 锚点和 Shield Guard；Vordak 留在冲锋外但可能被射击；移除非法附件。 | 顶二不能得分正确。Hysene 主动接受可控风险，目的是诱导对方投入后反击；这不是单纯走上去送死。但 Strygon 的 3 英寸保护覆盖和多个锚点位置需要精确几何证明，录像不足。 | 构筑纠错、资源、Shadow Shift、Shield Guard 可审计；Closed Quarters 得分与 Muddy Ground 不可执行。 |
| `15:13-20:06` Orgoth 2 | Oriax 脱离 killbox 风险；Execrators 争夺目标并使用击退，维持 Star-Crossed；Ravener 保护 Oriax；双方回合后 `1:1`。 | 得分叙述符合官方时点。Oriax 的防刺杀阵型使 Nyrro 下一回合需要先清路或拉拽。 | `Star-Crossed` 当前没有执行实现；本场对手状态不能形成 strict 后继。 |
| `20:15-29:19` Nyrro 3 | Sybaris 击杀 solo 后 Snatch & Drag；Vordak 冲锋并因 MAT 5 考虑增幅；战兽清理并通过 Feast 生成 Hunger；Hysene feat 后获得免费 Gallows，增幅命中仍未达到所需结果；因无法稳定触发退款而不使用 Brutal Strike。 | 资源链和动作理由连贯：先清路/产 Hunger，再尝试 Gallows 拉出刺杀位置。feat 在此回合有免费法术和击杀增甲价值，明显优于首轮空放。放弃 Brutal Strike 也合理，因为 7 Hunger 投资在无法一击摧毁目标时会破坏 Shadow Shift 安全预算。 | Feast、Hunger、Snatch & Drag、Vampiric Shroud、Gallows、Brutal Strike 均已有实现；部分固定来源仍待 Search 发布收据，不能作为当前策略值真值。 |
| `29:25-35:48` Orgoth 3 | 维护阶段分配资源并修复 Ravener；Vengeance、Careful Reconnaissance、Gnasher 冲锋依次发生；Hysene 转移一次伤害并在稍后命中后 Shadow Shift。玩家承认错误使用两张卡，导致不能再用 Bite And Hold 保住得分。 | 这是对手回应必须逐动作进入搜索树的实例：伤害转移和 Shadow Shift 改变后续目标、位置和资源，不能用固定反击脚本近似。 | 转移、Shadow Shift、Vengeance 有共享执行基础；`Careful Reconnaissance` 和 `Bite And Hold` 没有可认证执行实现。 |
| `35:55-38:02` Nyrro 4 | Rider/solo 尝试 Critical Freeze 未命中；Hysene 给自己 Storm Rager，冲锋 Oriax，并以 Fury 购买额外攻击完成刺杀。玩家先误以为可直接花 2 Hunger 购买两次攻击，随后恢复 Hunger、改花 Fury。 | 这是 Hunger 规则的关键负向对照。Murderous Impulse 只有在本次战斗行动中的近战攻击摧毁敌模后才开放；不能无条件把 Hunger 当 Fury 买攻击。录像最终修正后的执行合理。Leader 被摧毁后游戏立即以刺杀结束。 | 当前 Hysene 原子会在未发生合格击杀时拒绝 Murderous Impulse，并保留普通 Fury 购买攻击；该规则点可用于未来录像回放门禁。 |

## 5. 系统能力判定

### 已证明有用

1. 当前构筑器能重建合法 Nyrro 军表，并拒绝录像中多出的附件。
2. Nyrro 的首轮 Dash/Storm Rager、跑动、Shield Guard、Shadow Shift，以及后续
   Fury/Hunger、Brutal Strike、Murderous Impulse、Vampiric Shroud、Gallows、
   Snatch & Drag 等关键动作均已有 Engine 执行入口。
3. 玩家主动纠正的两类错误都能成为严格负例：非法附件不能进入军表；没有合格
   击杀时不能用 Murderous Impulse 购买攻击。
4. 视频中的行动理由、对手回应和计划破坏可以映射到 Ticket 20/21 的动作域与
   对手量词，不需要 LLM 参与规则裁决。

### 当前必须失败关闭

1. **场景缺失**：Closed Quarters 与 Muddy Ground 未进入场景 Host。
2. **对手规则缺失**：Star-Crossed、Careful Reconnaissance、Bite And Hold 等
   Orgoth 来源没有可认证执行器，不能生成完整对手回合。
3. **Search 收据过期**：当前 Host 收据为
   `77533930afa0dff5593fa3deb0e4a866848f57ec67301b07f0f08ccb7cf8f640`；
   Search 仍绑定 2026-08-27、`679` 文件的 Slice 23.4 收据，而当前观察到
   `1188` 个执行源文件，触发 `focused_engine_execution_source_receipt_mismatch`
   和 `focused_engine_source_file_count_mismatch`。
4. **录像几何不充分**：不能从 320x180 分镜严格恢复底盘坐标、路径扫掠、接触、
   LOS 与量尺边界；这些分支只能标记 `geometry_unknown`，不能猜为合法。
5. **最优性未闭环**：当前能严格检查部分候选，但未穷尽本场首轮连续位置、完整
   Orgoth 回应和后续 Chance，不能发布“最佳行动”或胜率。

因此，这个案例证明系统已经能做有价值的局部规则审计，但也证明当前完整真实
对局链路尚未成功。正确产品结论是 `partial evidence + fail closed`。

## 6. 首回合最佳支持方案

下列方案是根据录像公开信息和当前已执行规则得到的“证据最充分方案”，不是已
证明的唯一最优解：

1. Hysene 早激活，先施放 Dash，使后续 warrior 获得速度收益；不要把 Dash
   错算给 Sybaris、Vordak 或 Strygon。
2. 本场更支持把 Storm Rager 留给 Hysene。录像玩家在第二回合也认为 50 分局里
   该选择更好；给前方 Rider 的增益没有迫使 Orgoth 接战。若明确把 Rider 当
   诱饵，则必须用对手击杀概率和反击收益证明该替代线。
3. 首轮不使用 Vampiric Shroud。没有可利用的击杀增甲链，免费法术也没有形成
   决定性资源差；保留到实际交战回合更有价值。
4. 不把“全部跑满”写成固定策略。每个 warrior 可以利用 Dash 奔跑到威胁带和
   场景带；Vordak 必须同时枚举 `advance + Razor Fan` 与 run，只有没有合法、
   有价值的射击时才舍弃前者。
5. Muzzled Strygon 保持对 Hysene 和一个前置高价值模型的 3 英寸 Shield Guard
   覆盖，并尽量让首次敌方攻击伤害触发 Bonded Essence。不要为了同时覆盖所有
   模型而让全军过度聚团。
6. Hysene 保留 2 Fury、至少一个活着的转移目标，以及两个方向不同且合法的
   Shadow Shift 锚点；终点必须在对方可靠重击威胁之外，或证明接受该威胁后的
   反击收益更高。
7. Fane Knights 分散提供不同撤离方向；两个 Rider 分压两翼。首轮目标不是得分，
   而是迫使对手在防刺杀、争夺中央和保护侧翼之间分配资源，同时保留己方第二轮
   的 Hunger 生成与反击链。

这套方案不能直接外推为对 Sepsira 六队 Mechanithrall Swarm 的最佳开局。Cryx
的人墙、Tough、反 AoE、路线堵塞和反手交换会改变阵型与目标优先级；精确结论仍
需 Cryx 专项终局、回应和概率搜索。

## 7. 后续修复顺序

1. **Ticket 23.7/23.8 与 Ticket 12**：把 Tales from the Frontlines 的场景、
   随机条件和精确来源哈希接入 Engine；为 Closed Quarters 得分/胜利和 Muddy
   Ground 放弃战斗行动建立独立语义、执行与负例。
2. **Ticket 23.8/23.9**：按固定来源补齐本场 Orgoth 规则，并让它们与 upkeep、
   命中修正、Pathfinder、命令卡使用次数及场景控制产生交互义务。
3. **Ticket 23.10/23.11**：完成 Engine 聚合认证并更新 Search 当前收据；在此前
   所有本案例策略值保持不可发布。
4. **Ticket 20**：支持用户按回合开始手工校准精确棋盘状态，并保留录像无法确定
   的坐标、路径和隐藏信息为显式未知域。
5. **Ticket 21/22**：从每个回合起点枚举双方动作、Chance 和对手最优回应，先在
   可穷尽的局部域证明缩减不丢失值，再扩展整回合。
6. **Ticket 09/10**：把录像实际线、规则错误线和系统推荐线并排回放，中文报告只
   在收据、对手回应和未决质量三项都显示时发布。

