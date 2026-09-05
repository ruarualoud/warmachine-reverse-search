# 建立规则语义权威、原语重认证与可信 Strict 门禁

优化复核（2026-09-05）：见[全工单原理审计](../../../docs/research/ticket-search-principles-audit-20260905.md) 的 `OPT-23`。这是待实现/待验收的优化子任务，不改变下方历史完成范围；`Blocked by` 表示最终完成依赖，局部研究开发见报告的分阶段安排。

Type: task
Status: open
Blocked by: 04
Blocks: 20-completion, 21, 22-real-binding, 08-13-recertification, skill-promotion, online-experiment
Part of: ../map.md

## Question

怎样把当前“执行代码存在、原子已注册、verifier 能通过”的证据，升级为“官方规则已经独立表达为可计算语义，枚举器与执行器按统一时序消费它，所有高风险交互和故意破坏都能被门禁发现”的可信 Strict 证明？

## Why This Ticket Exists

当前审计已经证明旧门禁不能支持全局 Strict 声明：

- 覆盖脚本把规则族状态硬编码为 `strict_executable`，并以 marker/文本命中代替语义证明。
- 官方规则清单、原子注册表、交互图、执行代码和 Search 使用的规则来源没有形成同一动态分母。
- verifier 可以复制当前实现的错误理解。Witch Mark 与 Stealth 的自动命中/自动未命中优先级就是已确认反例：Engine 与 verifier 同时把错误行为当成正确结果。
- 通用“一轮”过期、生命周期顺序、Unit 冲锋、反应攻击和 adapter 回合推进等高扇出行为存在已确认错误，会污染多个规则原子和跨回合搜索。
- Root、Strict Engine、Layer3 和 Search 可以绑定不同执行源码；Search 发现 focused receipt 过期后，多数入口仍能生成一套新的内部自洽结果，而不是统一 fail closed。
- 当前卡牌规则来源仍有大量未认领项；“原子有 consumer”不能证明所有当前规则已经进入动作枚举、状态执行和组合验证。

因此，本工单将全部现有规则语义视为“待重认证实现”。历史代码、路线、fixture 和报告保留为候选实现与回归素材，但在重新认证前不具备 `trainingTruth`、全局 Strict、策略值或线上实验权威。

## Decisions

1. 官方当前规则文本、Steamroller 文本和卡牌数据快照是规则来源权威；运行代码、旧 verifier、历史 replay 和 skill 都不是规则来源。
2. 可计算语义必须独立于运行实现和测试结果。它描述适用条件、时序窗口、读取/写入状态、选择权、Chance、持续时间、优先级、替换/禁止关系和关联规则。
3. 原语是最小可复用状态运算；规则原子是把原语挂到标准钩子的规则模块；钩子是游戏驱动器中的时序插口；玩家动作只是进入该驱动器的一类输入。四者不得混用。
4. verifier 的预期值必须由规则语义或独立人工审定的规则例子产生，禁止调用被测执行 helper 推导 expected state。
5. Strict 是从当前动态分母计算出的结论，不允许手写 `status: strict`、以 marker 存在代替行为证明，或把未决项忽略出分母。
6. 关联图是派生审计证据，不是第二套规则权威。它必须从语义的状态读写、钩子、优先级、抑制、替换和持续时间关系生成。
7. Search、LLM、skill、ranker 和报告只能消费 Engine 给出的合法动作、响应、Chance 和后继状态，不得参与规则裁决。
8. 任何规则、卡牌、语义、原语、钩子或执行源码变化都必须定向使依赖证明、checkpoint、skill 和报告失效；不能继续使用旧绿灯。

## Domain Model

```text
OfficialRuleSource
  -> SemanticRule
      -> RuleAtom
          -> PrimitiveOperation
          -> TimingHook
          -> InteractionObligation
      -> ActionEnumerationContract
      -> TransitionContract
      -> IndependentOracleFixture
      -> MutationObligation
```

### SemanticRule minimum fields

- `sourceRuleId`、来源路径、版本和精确文本范围
- 规则适用对象、条件和明确排除条件
- 所属阶段、窗口及相对时序偏序
- 状态读取集合与状态写入集合
- 新增、修改、禁止或替换的动作/状态转换
- 玩家、对手或系统的选择归属
- Chance 支持集及精确概率质量
- 持续时间、过期锚点及刷新/叠加规则
- `can`、`must`、`cannot`、自动命中/未命中等优先级
- 对其它规则的忽略、抑制、替换、依赖和冲突关系
- 对应原语、规则原子、枚举 consumer、执行 consumer 和独立 oracle
- 当前 disposition：`strict_certified`、`explicit_nonruntime` 或 `unresolved`

### PrimitiveOperation minimum fields

- 明确输入、前置条件、输出和允许写入的状态字段
- 所属时序窗口和是否可重入
- 是否产生玩家选择、对手响应或 Chance
- 失败是 strict reject、pending 还是不适用
- 代数性质与不变量，例如交换律、幂等性、总质量守恒或偏序
- 所有直接依赖原子和反向影响索引
- focused、组合、性质和 mutation 证明

## Required Artifacts

1. 当前官方来源快照与内容哈希清单。
2. 版本化 `SemanticRule` 注册表及 schema verifier。
3. 版本化公共原语目录、状态读写合同与原语性质清单。
4. 唯一标准时序 DAG，覆盖 setup、回合、激活、攻击、伤害、生命周期、反应和过期。
5. 从语义派生的规则关联图和每条未闭合交互义务。
6. 当前全部规则来源的 ownership/disposition 账本。
7. 独立 oracle fixture 清单及来源引用。
8. 高风险 mutation 操作符、杀死矩阵及残留 mutation 债务。
9. Root/Engine/Layer3/Search 的单一复合执行收据及 parity 报告。
10. 历史 Strict、skill、checkpoint、路线和值报告的 quarantine/demotion 清单。
11. Ticket 23 聚合完成报告，逐项给出分母、通过数、未决数和声明边界。

## Vertical Slices

### Slice 23.0: 隔离旧结论并建立真实基线

状态：已完成（2026-08-26）。实现/验证代码涉及 `23` 个文件，连同 Ticket、TASKS 与 durable memory 共 `28` 个受影响文件；自动生成报告不计入该数量。

- 生成只读 quarantine manifest，列出所有受当前源码、规则来源和门禁缺陷影响的 Strict、skill、checkpoint、路线和值报告。
- 旧工件不删除；UI 和下游消费统一显示 `rules_semantics_unreviewed`，并强制 `trainingTruth=false`、`strictSearchReady=false`。
- 选择一个官方规则、一个卡牌规则和一个 Steamroller 规则作为贯穿样本，证明来源清单能稳定定位、哈希和版本化。
- 删除或旁路所有硬编码 Strict 状态；新聚合门在没有语义证据时必须返回 false。

完成证据：篡改任一来源、执行源码或语义文件会使基线与所有下游收据失效；旧报告不能恢复当前 Strict。

实际证据：authority `8b374731...` 稳定绑定主规则/Steamroller/card 三类样本，三者篡改均改变收据；当前 `16` 条原因隔离七类声明。Search 执行闭包为 `77` 文件且 `current=false`，可达性报告保留 `17` 层研究路线但训练候选为 `0`；Root 隔离 `10/10` 历史 manifest，Layer3 显示 `rules_semantics_unreviewed`，route3 launch 为 false。

### Slice 23.1: 用自动命中/未命中建立首条完整语义纵切

状态：已完成（2026-08-26）。实现、验证与配置涉及 `14` 个文件；连同 Root/Engine/Search 的任务、memory 与本 Ticket 收口记录，合计 `20` 个受影响文件。

- 从官方优先级、Stealth、True Sight、Witch Mark 建立独立语义记录。
- 建立 `resolveAutomaticHitMiss` 原语，明确 `cannot/autoMiss` 对 `can/autoHit` 的优先关系。
- 枚举并执行单规则、两两组合和三者组合；攻击类型、距离、忽略规则和非法目标必须进入分母。
- 修复 Engine 与 Search Chance 对相同优先级的分歧。
- mutation 必须至少杀死：交换 autoHit/autoMiss 顺序、忽略 True Sight、删除距离边界、让 verifier 调用执行 helper 四类错误。

完成证据：同一规则语义独立驱动 Engine focused oracle、Search parity 和组合矩阵，任何故意反转都失败关闭。

实际证据：共享源重签后的来源收据 `eefdb6c52268e8ab5f6c3bcb5271d3533c85b84dd571f4fe675b50a7938174d8` 绑定 `5` 条语义、`2` 个原语和 `12` 个独立 oracle；优先级反转、忽略 True Sight、删除距离边界与 oracle 自引用四类 mutation 为 `4/4` killed。Engine 的 Witch Mark/Stealth/True Sight/Spell Ward 与显式掷骰选择共 `19` 个执行例通过；Search 对自动未命中、自动命中和正常掷骰分别生成 `1/1/36` 个攻击结果，概率质量守恒且不导入语义 resolver。射程外与零攻击骰自动未命中不在本纵切冒充完成，明确移交 Slice 23.5。全局 Strict、`Q_rule`、训练、skill 晋级与线上实验继续为 false。

### Slice 23.2: 重建持续时间、回合角色和生命周期时序

状态：已完成（2026-08-26）。实现、验证与配置涉及 `17` 个文件；连同 Root/Engine/Search 的任务、memory 与本 Ticket 收口记录，合计 `23` 个受影响文件。

- 建立唯一的 first-player/second-player 回合推进语义，Root、Engine 和 adapter 不得按固定玩家编号判断 round。
- 建立“一回合”“一轮”“本次激活”“直到下次控制阶段”等过期原语，显式绑定触发时当前回合玩家、效果来源和受影响模型。
- 固化攻击与模型生命周期偏序：声明、命中、伤害、disabled、boxed、destroyed、remove/return、attack resolved、after attack。
- 覆盖普通攻击、Free Strike、reaction、Dark Consecration、Freeze、Disruption、Shadow Bind、Tough、RFP、Return 和击杀后动作。
- mutation 必须杀死：错误过期方、跳过生命周期阶段、提前 attack resolved、固定 `player2 -> player1` round 推进。

完成证据：普通与反应攻击共享同一时序权威，跨双方回合 replay 的事件序列和最终状态都与独立 oracle 一致。

实际证据：来源收据 `5380afeef7d85b03a3615f281ee4320c02da73cf5aa0687456ee4f626ef53426` 绑定 `5` 条语义、`3` 个公共原语和 `15` 个独立 oracle；固定玩家编号、错误过期方、跳过 boxed 与提前 attack-resolved 四类 mutation 为 `4/4` killed。Engine 与 Layer3 对 player2 先手反例均正确在实际后手结束后加轮次；Search 只消费同一 Host 后继和事件。Stir the Blood、Free Strike/Reaction Attack、Dark Consecration、Freeze、Disruption、Shadow Bind、Tough/RFP、Return、击杀后动作、`17` 个替换生命周期场景、`9` 个 attack-resolved 消费者和 micro `108/108` 均通过。全局 Strict、`Q_rule`、训练、skill 晋级与线上实验继续为 false。

### Slice 23.3: 重认证完整激活、Unit 移动与战斗行动

状态：已完成（2026-08-27）。当前 Ticket 23 为 `4/12` 纵切完成；全局 Strict 仍为 false。

- 从规则语义生成 advance、run、charge、failed charge、aim、forfeit、stand up、special movement 和 Unit 逐模型移动约束。
- Unit 冲锋必须保留声明目标、最低距离、首个近战攻击义务、不能攻击时的后果和 charge attack 分类。
- 整次 Unit Combat Action 覆盖所有 initial、CMA/CRA、特殊攻击、额外攻击、随机/固定 ROF、目标和顺序；被摧毁 pending 模型不能卡死序列。
- 覆盖 Combo Strike、Combo Smite、Smite、Rapid Strike、Guns Blazing、Combat Chemistry、Ready Ammo、Fast Reload 和 Dual Shot 的真实当前数据组合。
- 所有动作都要有 accepted/rejected 双向证据；accepted 必须按同一 action key 严格执行，rejected 不得通过 fallback 执行其它动作。

完成证据：真实 Mechanithrall/Kithguard Unit 场景的动作分母、时序和后继状态闭合，Ticket 20 只消费该收据而不重建 Unit 规则。

实际证据：8 条语义、6 个原语、15 个 literal oracle 与 6/6 mutation 闭合；Great Bears、Rapid Strike、Guns Blazing、Combat Chemistry、随机 ROF、Dual Shot 与 CMA/CRA 共享精确 Unit 攻击槽账本。Engine/Layer3/Search Host parity、Unit focused 组和 micro `108/108` 通过，聚合收据为 `1ab1df164b95bc99005e4f54d43b364a9f500493493ae5bce801aee984dc8481`。Whole-Unit opponent-response/Chance 分区与部分结构化 proof role 保持后续债务。

### Slice 23.4: 重认证连续移动、地形、LOS 和位置关系

状态：已完成（2026-08-27）。当前 Ticket 23 为 `5/12` 纵切完成；全局 Strict 仍为 false。

- 原语覆盖整底盘棋盘边界、路径扫掠碰撞、最终摆放、单位遮挡、地形遮挡、云雾/森林/建筑、高度、近战距离和控制范围。
- Flight、Ghostly、Incorporeal、Pathfinder、Amphibious、Eyeless Sight、Stealth/True Sight 只忽略规则文本明确允许忽略的约束。
- place、push、slam、throw、trample、reposition、overtake、bulldoze 等移动必须进入相同几何权威并保留各自时序/接触差异。
- Ticket 20 的几何商只能在这些规则可观察谓词和后继关系恒定时合并。

完成证据：同端点不同路径、同路径不同事件、边界接触、底盘遮挡和规则忽略组合都有正反 oracle；近似采样不能晋升为普遍合法性。

实际证据：16 条官方来源语义映射到 10 个可复用几何原语；15 个 literal oracle 与 movement/LOS 独立预言机共杀死 14/14 mutation。Engine/Layer3 的普通、主动、反应和强制 Falling，路径/端点分离、地形穿越、纵向通道、近战高度、LOS witness 与 sound occlusion certificate 均实跑；不支持的连续并集和未映射垂直几何在状态修改前 fail closed。完整 focused 矩阵为 `288/288`（235 rule-atom + 53 strict-transition），绑定同一 `679` 文件执行源闭包，收据 `030870124e891a084eeac21f79141b4f8fa7bdceab8fd4a0a3aaa246e8e1c988`。Search 重绑后 13 组 Host 权威、几何商、Unit 路径和激活顺序验证通过；完整跨 Root/App/Layer3/Search parity 仍由 Slice 23.10 负责。

### Slice 23.5: 重认证攻击、骰子、伤害和模型系统

状态：已完成（2026-08-28）。当前 Ticket 23 为 `6/12` 纵切完成；全局 Strict 仍为 false。

- 统一攻击声明、合法目标、攻击类型、攻击/伤害骰、boost、reroll、critical、自动命中/未命中和额外攻击窗口。
- 正确处理零骰、保留骰、全 1/全 6、爆炸/喷射、blast、damage type、Resistance、Blessed、Weapon Master、Shield/Buckler 和符号 POW/RNG。
- 完整执行 warjack grid、warbeast spiral、Monstrosity、Horror Web、Colossal、Dragoon、结构和多生命模型。
- Chance 枚举必须守恒，显式骰值不能绕过合法分布；Search 与 Engine 使用同一精确分布。

完成证据：攻击到最终模型状态的端到端 transition oracle、性质测试和关键 mutation 全部通过。

实际证据：Engine 对 `29` 条核心攻击/伤害语义、`32` 个原语、`90` 个独立 literal oracle、`36` 个执行证据和 `97` 个 mutation obligation 完成动态核对；`14` 组 focused verifier 全绿，来源收据为 `d08f2225261b91e4973be4da843058cbd8f8fa8bb99a0b499c9daca5a4d2b8fb`。伤害转移的防守方选择发生在新受伤模型的系统位置 Chance 之前，Search 对 `12` 个主 Chance、`2` 个转移响应和 `6` 个转移后 life-spiral 分支守恒；当前 Host 收据为 `9bcbd810b76b8848bb301d6b7a314290b233f3f162dd86318ff4aa1fc556202b`，parity 报告为 `555d460b6d577c5325cda7d015436ae133d3d1cf4d667f14493002dcd118f5f5`。Dragoon 现在保留原始受伤量、实际记录量和 excess damage，并能严格执行任意合法、整底盘可放置的 dismount 坐标。当前卡牌特有攻击模板和缺失的卡牌 life-spiral 拓扑归 23.8，连续替换位置商归 Ticket 20，完整运行时发布一致性归 23.10；这些债务不在本纵切中重复实现。

### Slice 23.6: 重认证 Focus/Fury/Essence、法术、animus 与控制阶段

状态：已完成（2026-08-29）。23.6a 普通 Maintenance/Focus、23.6b 普通核心 Fury、23.6c 普通法术与 23.6d Essence/特殊资源均完成有界重认证，父级普通资源交互和 Search Host 消费 parity 已闭合。当前 Ticket 23 为 `7/12` 父纵切完成；全局 Strict 仍为 false。

- 建立控制阶段标准顺序，覆盖 upkeep、allocation、leach、threshold/frenzy、shake、reave、Spirit Bond、Provoke 和外部资源提供者。
- 资源身份、容量、控制范围、支付顺序、强制/非强制获得和超限行为必须来自明确语义。
- spell、rack、animus、feat、channeling、upkeep、同名效果、持续时间和 target/range/stat 统一进入动作枚举与执行。
- Warlock 驱使 warbeast、吸收 Fury、frenzy 可见目标及非 force 增加 Fury 的规则必须覆盖完整前后态。

完成证据：至少一个 warcaster、warlock、Infernal Master/Essence 和特殊资源场景跨完整控制阶段 strict replay。

首轮盘点证据：`15` 个规则/执行链 focused 检查已覆盖 Focus/Fury 分配与操纵、leach/threshold/frenzy、资源消耗、warbeast aspects、spell buff/debuff、target-token upkeep、soul/corpse 和完整双方控制阶段。盘点发现一个真实 Layer3 bridge 缺口：`tokenCombatStats()` 未传递 token/card 的 ARC，导致 ARC 7 被 Engine 默认值 6 替代；修复后 warcaster 在下一次 Control Replenishment 从 Focus `5 -> 7`，warlock Fury 对照保持 `5 -> 5`，token patch 和重建状态一致。另外两个失败属于历史 verifier 夹具漂移：自动命中现在允许明确放弃自动命中后选择攻击掷骰，伤害转移/reave/heal 夹具需要当前 life spiral、damage column 和移除格选择。Playwright 法术数值显示测试因本机没有 Chromium 未执行，它是 UI 证据，不计入本轮规则认证。Search 在冻结当前 Host `9bcbd810...202b` 后重跑概率/恢复全链，报告 `f4634cec...2603` 对 `1,927` 节点、`2,674` 边、`68` 个 Chance 审计和 `816` 个 owned response 审计通过，顺序/并行续跑等价；此前失败确认是运行中修改 Engine 导致的收据漂移。上述结果只证明历史实现可作为复核候选，不能替代 23.6 的来源语义、独立 oracle、interaction 和 mutation 分母。

23.6a 实际证据：普通 Maintenance/Focus 路径已经建立 `5` 条官方来源语义、`6` 个共享原语、`22` 个独立 literal oracle 和 `12/12` killed mutation；旧控制周期回归为 `42` 项，Layer3 ARC/target-token bridge 为 `200` 项，micro 为 `108/108`。审计同时发现并修复旧执行缺陷：外部状态把 warjack `resourceMax` 声明为 `4` 时，Power Up/分配曾可沿用该值；现在两条路径统一消费官方固定上限 `3`，分配的原语结论也进入动作元数据和回放事件。23.6a 收据为 `7b6b5d0630e580d33e5f295f90879c705185f8d7ad1c991ba8f39f560376c934`。这只认证普通 Focus 子域，不包含 Fury、法术、Essence 或完整跨运行时发布。

23.6b 实际证据：普通核心 Fury 复用历史 leech、Spirit Bond、forcing、threshold/frenzy、transfer、reave、heal 和 aspect 执行器，并以 `8` 条来源语义、`9` 个共享原语、`35` 个独立 literal oracle、`13/13` killed mutation、七条历史 focused 链、Layer3 防守方转移续接和 micro `108/108` 重新认证；修正报告门后的收据为 `47e7422b74d244c439f642f0c298a89980a1df63711479551d41cbe2bffdef5e`，权威收据为 `54ab5d64a0482e2e320031f3ad517dd8953626844f1eae13c26efff32503e394`。实际修复包括容量使用当前 ARC、threshold 严格输入 2d6、普通 Construct 战兽治疗拒绝、转移后为所选战兽生成系统位置 Chance，以及 Wild 战兽不能经非 force 来源获得 Fury。Provoke 完整施法/再次 frenzy/每回合一次、Elemental Mastery 的 Construct 治疗例外和特殊 reaver 仍是待分配到 23.6d/23.8 精确来源所有者的交互债；这些不冒充已完成。

23.6c 实际证据：普通 spell/upkeep/animus/feat/channeling 以 `7` 条来源语义、`8` 个共享纯原语、`26` 个独立 literal oracle 和 `9/9` killed mutation 重认证；聚合复放新核心执行 `15` 例、command/channel `36` 例、card-text `172` 例及 micro `108/108`，Engine 收据为 `f7f7ab871f61479dc6074b940686c65619283029499f415a51cea6624f6da2f4`，权威收据为 `54ab5d64a0482e2e320031f3ad517dd8953626844f1eae13c26efff32503e394`。实际修复包括 upkeep 固定维护费 1、当前数据战兽法术按 animus 识别、战兽自身与 warlock 战斗群借用权限、战兽每次激活一次、同 caster/同侧/整个 Unit 的 upkeep/animus 替换、替换和到期时反转数值效果，以及结构化 leader 身份优先于误导名称。Search 只从 Host 消费同一组 rules/primitives/adapter 哈希，专项 parity 报告为 `dda66ab1a320b0466af4ea20325490111ad4d775b492afd928e76983402ee182`，Search 自有法术规则为 0。

23.6d 与父级实际证据：Essence/Infernal 核心以 `13` 条来源语义、`13` 个共享纯原语、`30` 个 literal oracle、`16/16` killed mutation、`9/9` Engine/Layer3 执行例和 micro `108/108` 重认证；实际修复包括 current ARC/ESS 权威、单一补充方式及后续菜单不可重开、life-force leech/sacrifice、无 LOS 要求的战斗群分配、Maintenance 超限清理、治疗、向满 ESS Horror 的伤害转移、Infernal Master 离场后的 Horror RFP、Layer3 身份/计数器/回滚，以及恢复 strict Rage Fueled 候选。23.6d Engine source receipt 为 `eaa0b03fae6454c8351428a8ef8d2ef91bd10d7a07eb0112ef37949ec9fcc98a`，Search 专项报告为 `a980d3c6c2d4daca92165299d969da914fa27d6a37217cbf89e89d796be0252a`。父级绑定四个当前子凭据，共 `33` 条语义、`36` 个原语、`113` 个 oracle、`50/50` mutation 和 `9` 个跨资源 Engine 场景，报告 `f38cb8aa39fba16f8f1a536bacbe7c0cb2c06a68155415840e06174f721ae07f`；Search Host `98ba424d9d9a8654a9eaebb96f4832e9554abe8853baa77c587c3d33dcaed6af` 以零条自有规则通过 `7` 个 Focus/Fury/Essence 交互场景，报告 `756e25be7e25442ad8754e4fcba0dd39cfa8ff12891821c8059c239d7ade7e6d`。Provoke、Elemental Mastery、特殊 reaver、卡牌特定 COST/目标/资源替换和 Magic Ability 时机明确归 23.8，未被父级普通资源认证覆盖。

### Slice 23.7: 重认证军表、部署、场景和胜利条件

状态：已完成（2026-08-29）。23.7a 普通军表构筑与模型身份、23.7b 核心 setup/deployment、23.7c Steamroller 2026 及父级连续生命周期均完成重认证。当前 Ticket 23 为 `8/12` 父纵切完成；全局 Strict 仍为 false。

- Force Builder 与运行状态共享模型身份、点数、FA、Character、附件、战斗群、可选配装、companions 和模型数量语义。
- setup 覆盖先后手、Attacker/Defender、部署区、Advance Deployment、Ambush、reserves、Scenario Terrain 和合法 Unit 部署。
- Steamroller 覆盖全部场景元素、控制/争夺、计分时机、Kill Box、固定回合、Scenario Presence 和同时 Leader 移除。
- 终局必须由精确历史和当前几何派生，禁止直接改写分数或终局标签。

完成证据：七场景的构筑到部署、至少一条刺杀和一条得分纵切，在不同先手角色下独立重放。

实际证据：父级绑定当前 23.7a-c，共 `36` 条来源语义、`23` 个共享原语、`109` 个独立 oracle、`67/67` killed mutation 和 micro `108/108`；Engine 报告为 `ee8857ce2315f4bc6ff96d3196636052c1b4063fd5d1a185f10a0304afd3e767`。Search Host `ec575f868fe5cfbfe1ddbf6e4c2e05d2b21d4dd37cc3d57e22219430b5c516c0` 以零条自有最终规则执行得分开放/关闭窗口、重复账本拒绝、精确场景设置、Wolves 短移动拒绝、Payload 接触停止、High Stakes 缺 Chance 拒绝，以及 force-entry -> scenario setup -> first deployment 连续链，父 parity 报告为 `e4f8200a1cf3bc8fd54983d96aac75e096d3635e1df8623ebe039f11c4e58f33`。本轮真实修复包括 Layer3 先手推断和场景地形设置证据、Payload Made To Haul 接触停止、建筑内模型不计 Scenario Presence。

### Slice 23.8: 重认证全势力和当前卡牌规则来源

状态：进行中（2026-08-31）。23.8a 已建立当前来源动态分母，后续有界子纵切持续闭合精确复用、共享 Host、参与者来源和当前数据规则；父纵切尚未完成，Ticket 23 仍为 `8/12`。

- 对当前数据全部规则来源进行语义去重，区分共享规则、参数化变体、纯展示文本和真正独有行为；不按文本数量机械创建重复原子。
- 每条来源必须唯一处置为：绑定已认证语义、明确非运行内容或 unresolved。
- 优先闭合 corpse/soul/hunger、Infernal、Cephalyx、Rhul、Convergence、Command/Arcana、预备队/空投、替换/RFP、多模型和可配装模型。
- 每种独有机制至少有一个自然前态到后继状态的真实场景，并证明规则原子确实被动作枚举和执行消费。

完成证据：当前来源 ownership 为动态 `100%`，且任意新增/修改来源会自动生成未决债务并定向使依赖证据失效。

当前证据：当前数据版本为 `40049`，动态来源分母 `3159`。截至 23.8x，精确闭环 `572`、未闭环 `2587`；规则注册表为 `547` 个原子定义 / `650` 个钩子声明，全部当前声明 proof role 闭合。23.8x 用一个共享 strict Host 闭合 `18` 条 Field Marshal 来源：复用 `15` 个载荷原子，只新增一个 transport-only Unyielding 载荷，并以 `21` 条显式 allowlist 钩子运输防止文本推断和派生来源自举。Engine/Layer3/Route3-LLM-facing/Search Host-only 通过 `156` 条结构化证明、`15/15` mutation 和 micro `108/108`，聚合报告 `1ae7723b...a085`，Search 侧规则重复实现为零。Field Marshal 当前为 `22/62` 精确闭环，剩余 `40` 条需要载荷语义开发或审计；父纵切、全局 Strict、Skill/training、`Q_rule`、值与线上实验均未晋级。固定 `1274` 条人工审阅分母不因批量执行重新生成；下一批继续按共享 Host/动作族闭合完整来源，不把实现片、钩子或调度义务冒充规则来源完成数。

### Slice 23.9: 自动关联闭包、性质测试与变异门

- 从语义状态读写、钩子、优先级、抑制、替换、持续时间和动作资格生成 interaction obligations。
- 对冲突边生成必要的单规则、两两、关键三规则和跨阶段场景，不依赖人工记忆关联。
- 为高扇出原语建立性质测试；为每类历史缺陷建立 mutation 操作符。
- mutation 报告必须区分 killed、survived、equivalent 和 unresolved；survived/unresolved 阻止对应规则族 Strict。
- 关联图删除 consumer、执行、oracle、失效或版本边的负例必须失败关闭。

完成证据：关联图覆盖当前全部认证原子；所有声明为关键的 mutation 被杀死，任何残留均准确降级相关分母。

### Slice 23.10: 单一执行权威与跨运行时一致性

- Root、App、Layer3、Strict Engine 和 Search 只加载同一内容寻址的 Engine 发布物；禁止复制后独立修改执行器。
- 复合收据绑定规则源、卡牌数据、语义注册表、原语、钩子 DAG、执行源码、oracle、mutation 和 interaction graph。
- 旧收据不能只使 checkpoint 失效；所有新搜索、skill 和报告入口也必须在 `current=false` 时拒绝 Strict 运行。
- 同一状态/action key 在所有运行时得到相同 accepted/rejected 结果、事件序列和语义后继哈希。

完成证据：跨运行时 parity、源码漂移、数据漂移、旧 checkpoint、新任务生成和报告发布的正反矩阵全部通过。

### Slice 23.11: 全量聚合门与历史结果重新认证

- 聚合门从动态分母计算来源、语义、原语、原子、钩子、动作、交互、oracle、mutation、运行时和 Search readiness。
- 删除硬编码 family status 和 marker-only 证明；报告必须列出全部未决项及其影响范围。
- 重新运行受影响的 focused、规则族、组合、micro、场景和真实 Sepsira/Fane canary。
- 只有当前聚合门全绿，才允许重新签发 Engine receipt，并按影响图选择性重放 Ticket 05-20 历史证据。
- skill、ctx2skill/skill2ctx、线上实验和策略报告继续保持隔离，直到各自下游门另行通过。

完成证据：Ticket 23 completion report 的所有严格项为真、未决分母为零、故意注入每类历史错误都会使聚合门失败，且真实 canary 只能消费该收据。

## 纵切重复工作防护矩阵

本矩阵是进入任一纵切前的强制检查点。`历史已实现` 只表示执行代码或旧 focused 场景存在，不等于本轮独立语义重认证完成；`复核` 不得重写已有执行器，除非最小反例证明执行行为错误。

| 纵切 | 当前状态 | 已有实现/证据 | 后续只做什么 | 已确认真实缺陷 |
| --- | --- | --- | --- | --- |
| 23.0 | 已完成 | 来源绑定、quarantine、下游失效和 fail-closed 基线 | 保持收据随来源变化失效 | 无 |
| 23.1 | 已完成 | Stealth、True Sight、Witch Mark、自动命中/失手优先级 | 后续只做受影响回归 | 无 |
| 23.2 | 已完成 | 双方角色回合推进、持续时间、攻击生命周期、反应/Free Strike | 后续只做受影响回归 | 无 |
| 23.3 | 已完成 | Unit 移动/冲锋/攻击槽、CMA/CRA、随机 ROF、Dual Shot、Rapid Strike、Guns Blazing、Combo/Smite 等旧执行与新语义证明 | Whole-Unit 对手响应和 Chance 分区移交 23.9/23.10；不得重写这些动作族 | 无当前执行缺陷；完整分区仍是证明债务 |
| 23.4 | 已完成 | 连续移动、地形、LOS、底盘碰撞、place/push/slam/throw/trample/reposition 等共享几何权威 | 不支持的连续并集保留给 Ticket 20；跨运行时总 parity 归 23.10 | 无 |
| 23.5 | 已完成 | 29 条语义、32 个原语、90 个 oracle、36 个执行证据、97 个 mutation；14 组 focused 及 Search Host parity 通过 | 后续只做受影响回归；card-specific 归 23.8，连续替换几何归 Ticket 20，全运行时 parity 归 23.10 | 两个最小反例均已修复并复证 |
| 23.6 | 已完成 | 23.6a-d 合计 33 条语义、36 个原语、113 个 oracle、50/50 mutation；Focus/Fury/Spell/Essence、Engine/Layer3 与 Search Host 普通资源交互通过 | 后续只做受影响回归；Provoke、Elemental Mastery、特殊 reaver、Magic Ability 和卡牌特定替换归 23.8 | 已修容量/时序/身份/分配/转移/治疗/回滚与 Rage Fueled 候选缺口；无当前普通资源缺陷 |
| 23.7 | 已完成 | 23.7a-c 已认证 36 条语义、23 个原语、109 个 oracle、67/67 mutation、七场景和构筑到首轮部署连续链 | 后续只做受影响回归；卡牌特定场景替换归 23.8，全运行时总 parity 归 23.10 | 已修 Layer3 先手/设置证据、Payload 接触停止和建筑 Presence；无当前普通场景缺陷 |
| 23.8 | 进行中，23.8a/b 已完成 | 当前 385 个原子、474 个钩子；3128 条来源动态分母与 25 条精确同文本复用已闭合 | 先补 18 个证明待闭合原子，再按合同漂移/未归属语义簇复用或补最小执行 | 当前仍有 155 条已声明证明待补、338 条合同不一致、2244 条未归属 |
| 23.9 | 待完成，基础已存在 | 现有 interaction graph 为 67 个节点、186 条嵌套 interaction，已有部分 mutation/性质测试 | 从语义读写/钩子/优先级自动派生全分母，补 survived/unresolved 降级 | 旧图不是当前全部来源的自动闭包 |
| 23.10 | 待完成，基础已存在 | Host 单一入口、Engine/Search 内容哈希收据和多个局部 parity 已有；公共 helper 已强制归一化，独立仓库 Engine root 已 fail closed | 补 Root/App/Layer3/Search 同 action key 全 parity 与漂移矩阵 | 全运行时复合收据尚未闭合 |
| 23.11 | 待完成，门禁已有雏形 | 动态语义 authority 和 project completion report 已有 | 清点全部 verifier，重跑受影响历史证据和 canary，未决分母归零后才签发 | 当前发现 157 个 verifier、声明 82 个，75 个仍待分类，聚合 inventory 必然失败 |

2026-08-29 审计执行规则：每次开始一个纵切，先查本矩阵、`TASKS.md`、历史 verifier 和 `git log -- <执行器>`；默认 disposition 为“历史实现候选，等待重认证”，不能默认“未实现”。23.5、23.6 和父级 23.7 已通过各自来源、oracle、mutation、Engine、Layer3/Search 与 micro 证据；文档必须分开记录历史复用、夹具漂移和实际执行修复。下一步进入 23.8，先动态盘点全部当前卡牌来源 ownership/disposition、历史 verifier 和最小 unresolved，不重复开发已经有严格执行证据的动作。详细代码审计见 `docs/SEARCH_CODE_AUDIT_2026-08-28.md`。

## Dependency Order

```text
23.0 -> 23.1 -> 23.2
              -> 23.3
              -> 23.4
              -> 23.5
              -> 23.6
              -> 23.7
              -> 23.8

23.2..23.8 -> 23.9 -> 23.10 -> 23.11

23.11 -> Ticket 20 completion -> Ticket 22 real binding -> Ticket 21
23.11 -> Ticket 08/09/10/11/12/13 recertification
23.11 -> skill recalibration -> controlled online experiment
```

23.2 至 23.8 可以在 23.1 schema 和首条纵切冻结后并行，但不得同时修改未版本化的共享原语或钩子合同。公共合同先用小切片冻结，再由各族消费者迁移。

## Acceptance Criteria

- [ ] 所有当前官方规则来源均有内容绑定身份和唯一 disposition；生产声明范围内不存在未认领来源。
- [ ] 每个 `strict_certified` 规则具有独立语义、原语/钩子映射、枚举 consumer、执行 consumer、oracle 和 mutation 证明。
- [ ] verifier expected state 不调用被测执行 helper；审计器能检测并拒绝自引用 oracle。
- [ ] 标准时序 DAG 覆盖回合、激活、攻击、伤害、生命周期、反应和过期，所有运行时使用同一版本。
- [ ] accepted/rejected 动作分母守恒；accepted action key 必须执行对应动作，rejected action 不得 fallback 到另一动作。
- [ ] 所有真实 Chance 支持集质量精确等于 1；玩家选择、路径和坐标不伪装成 Chance。
- [ ] 关联义务从语义依赖派生；未闭合交互自动降级相关原子和规则族。
- [ ] 关键 mutation 杀死矩阵完整，至少覆盖优先级反转、过期方错误、生命周期跳步、候选删除、Chance 丢支和源码漂移。
- [ ] Root、Engine、Layer3、App 和 Search 对同一测试集具有执行 parity，并绑定同一复合收据。
- [ ] 任何来源、数据、语义、原语、钩子或源码变化都会使精确依赖项失效，旧结果不能自动恢复 Strict。
- [ ] 旧 Strict、skill、checkpoint、报告和训练材料在重认证前保持 quarantine，且 UI/接口不输出超范围结论。
- [ ] 当前端到端规则链的 source ownership、semantic proof、atom consumer、interaction closure、runtime parity 和 strict executor verdict 全部由计算得到并为真。
- [ ] 固定 Sepsira 六队 Mechanithrall Swarm 对 Fane canary 在当前收据下完成构筑、部署、Unit 激活、战斗、反应、Chance、生命周期、计分和回放验证；它仍不单独证明策略最优或全局胜率。

## Verification Matrix

计划提供一个聚合入口和可独立运行的短门：

```text
audit:wm-semantic-source-ownership
verify:wm-semantic-rule-schema
verify:wm-primitive-properties
verify:wm-timing-dag
verify:wm-action-transition-contracts
verify:wm-interaction-closure
verify:wm-semantic-mutations
verify:wm-cross-runtime-parity
verify:wm-ticket23-sepsira-fane-canary
verify:wm-ticket23
```

每个短门必须输出结构化分母、通过项、失败项、未决项、源码收据和声明边界。聚合入口只能消费本轮生成的结构化结果，不能以进程退出码或历史 build 文件替代内容校验。

## Migration Strategy

1. 不大爆炸式重写 380 个原子。先建立语义 schema 和一条高风险完整纵切，证明独立 oracle 与 mutation 门有效。
2. 以高扇出公共原语为迁移单位，优先处理时序、持续时间、合法动作、命中、伤害、生命周期、资源和几何。
3. 修复一个公共原语后，按影响图重新认证所有依赖原子；不能只重跑最初发现问题的卡牌。
4. 旧执行路径在对应语义纵切完成前继续隔离；新旧并行比较只用于发现差异，不能自动选择旧行为为真。
5. 每个纵切完成后冻结 schema、收据和负例，避免后续切片静默改变已认证含义。
6. Ticket 20 可继续开发与规则无关的搜索基础设施，但不得签发真实 `Q_rule`；Ticket 21/22 不得消费未完成 Ticket 23 的状态价值或剪枝证明。

## Cost and Checkpoints

本工单按 `105-175` 个有效工程日规划，不承诺自然日。公共原语复用会减少重复实现，但不会减少独立语义、交互和 mutation 证明。建议检查点：

- Checkpoint A：23.0-23.2，可信门禁骨架与前三个高风险反例关闭。
- Checkpoint B：23.3-23.6，核心对局驱动可重认证运行。
- Checkpoint C：23.7-23.9，场景、全来源和关联/mutation 闭合。
- Checkpoint D：23.10-23.11，单一运行时、全量门和历史证据重签。

每个检查点只升级其已证明范围；不得用局部完成百分比推导全局 Strict。

## Non-goals

- 本工单不证明连续搜索空间已有限，也不完成 Ticket 20 的 `Q_rule` 商空间。
- 本工单不进行策略剪枝、多回合最优值、自然胜率或军表排名。
- 本工单不生成或晋升 skill，不运行 Route3，不恢复线上实验。
- 本工单不以 LLM 或文本相似度裁决规则。
- 本工单不要求删除全部旧实现；旧实现可以迁移，但必须重新通过独立语义和 mutation 证明。

## Completion Boundary

Ticket 23 完成只证明当前内容绑定规则集在声明运行范围内具有可信、可更新、可失败关闭的执行语义权威。它不证明 Search 动作/连续空间已穷尽，不证明策略商完整，不证明任何军表最优，也不允许绕过 Ticket 20/22/21 的独立完成门。
