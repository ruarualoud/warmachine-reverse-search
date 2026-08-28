# 建立规则语义权威、原语重认证与可信 Strict 门禁

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

- 统一攻击声明、合法目标、攻击类型、攻击/伤害骰、boost、reroll、critical、自动命中/未命中和额外攻击窗口。
- 正确处理零骰、保留骰、全 1/全 6、爆炸/喷射、blast、damage type、Resistance、Blessed、Weapon Master、Shield/Buckler 和符号 POW/RNG。
- 完整执行 warjack grid、warbeast spiral、Monstrosity、Horror Web、Colossal、Dragoon、结构和多生命模型。
- Chance 枚举必须守恒，显式骰值不能绕过合法分布；Search 与 Engine 使用同一精确分布。

完成证据：攻击到最终模型状态的端到端 transition oracle、性质测试和关键 mutation 全部通过。

### Slice 23.6: 重认证 Focus/Fury/Essence、法术、animus 与控制阶段

- 建立控制阶段标准顺序，覆盖 upkeep、allocation、leach、threshold/frenzy、shake、reave、Spirit Bond、Provoke 和外部资源提供者。
- 资源身份、容量、控制范围、支付顺序、强制/非强制获得和超限行为必须来自明确语义。
- spell、rack、animus、feat、channeling、upkeep、同名效果、持续时间和 target/range/stat 统一进入动作枚举与执行。
- Warlock 驱使 warbeast、吸收 Fury、frenzy 可见目标及非 force 增加 Fury 的规则必须覆盖完整前后态。

完成证据：至少一个 warcaster、warlock、Infernal Master/Essence 和特殊资源场景跨完整控制阶段 strict replay。

### Slice 23.7: 重认证军表、部署、场景和胜利条件

- Force Builder 与运行状态共享模型身份、点数、FA、Character、附件、战斗群、可选配装、companions 和模型数量语义。
- setup 覆盖先后手、Attacker/Defender、部署区、Advance Deployment、Ambush、reserves、Scenario Terrain 和合法 Unit 部署。
- Steamroller 覆盖全部场景元素、控制/争夺、计分时机、Kill Box、固定回合、Scenario Presence 和同时 Leader 移除。
- 终局必须由精确历史和当前几何派生，禁止直接改写分数或终局标签。

完成证据：七场景的构筑到部署、至少一条刺杀和一条得分纵切，在不同先手角色下独立重放。

### Slice 23.8: 重认证全势力和当前卡牌规则来源

- 对当前数据全部规则来源进行语义去重，区分共享规则、参数化变体、纯展示文本和真正独有行为；不按文本数量机械创建重复原子。
- 每条来源必须唯一处置为：绑定已认证语义、明确非运行内容或 unresolved。
- 优先闭合 corpse/soul/hunger、Infernal、Cephalyx、Rhul、Convergence、Command/Arcana、预备队/空投、替换/RFP、多模型和可配装模型。
- 每种独有机制至少有一个自然前态到后继状态的真实场景，并证明规则原子确实被动作枚举和执行消费。

完成证据：当前来源 ownership 为动态 `100%`，且任意新增/修改来源会自动生成未决债务并定向使依赖证据失效。

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
