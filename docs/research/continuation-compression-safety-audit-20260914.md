# 延续搜索压缩安全审计

**日期：** 2026-09-14  
**范围：** Ticket 22 当前 142 个延续状态类及其后续策略商  
**结论性质：** 文献复核加当前实现审计，不是策略值或完整性证明

## 结论

当前的动作形状分组可以继续作为**比较调度器**，但不能成为合并或剪枝依据。
它没有删除状态或动作，因此目前没有造成策略丢失；然而，如果预算停止后只计算每组代表，
未展开成员仍会形成实际覆盖偏差。报告必须把这些成员保留为 `unresolved`，不得把代表结果
外推到整组。

真正能安全减少搜索空间的不是一种单独算法，而是一条分层证书链：

1. 精确状态重访只做内容寻址去重；
2. 只有模型/地图自同构证明成立时才做对称商；
3. 只有读写、几何、触发和终局观察均可交换时才用双人博弈顽固集删除激活排列；
4. 只有双方动作量词、Chance 分布和后继关系都匹配时才签发概率交替双模拟合并；
5. 非等价状态只能凭完整不可达、交替支配或可采纳上界证书剪枝；
6. 粗抽象必须给出上下界并由 CEGAR 拆分，未知项永远保留在补集队列。

该路线与仓库已有
[策略商学术报告](strategy-quotient-search-optimization-academic-v2.md)一致；本审计补充的是
“当前 142 类代码到底落实到哪一层”。

## 学术依据

### 状态相似不等于策略等价

Li、Walsh、Littman 区分保模型、保所有策略值、保最优 Q、保最优动作和只保共同最优策略
等不同抽象。较弱抽象不能推出较强的策略保留，错误聚合甚至会让抽象最优策略在原问题中
变成次优。这直接否定“首屏动作长得一样，所以后续策略一样”。

来源：
[Towards a Unified Theory of State Abstraction for MDPs](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/camera-ready-9.pdf)

### 双人随机博弈需要交替量词和概率提升

概率交替模拟要求匹配我方选择、对手反选择以及后继概率分布；等价合并还需要同一个对称
关系满足双向条件。只比较合法动作集合、期望伤害或一个代表回应都不够。

来源：
[On Probabilistic Alternating Simulations](https://arxiv.org/abs/1003.0788)、
[An Algorithm for Probabilistic Alternating Simulation](https://arxiv.org/abs/1106.1978)

### 粗抽象应产生上下界，不应直接产生一个值

Kattenbelt、Kwiatkowska、Norman、Parker 把原模型选择和抽象引入的不确定性分给两个不同
玩家，由此求得保守上下界；上下界差距驱动继续细化。对 Warmachine，这意味着一个几何
或动作组内尚未区分的成员应由“抽象选择者”取最坏/最好情况，而不是由代表成员代替。

来源：
[Game-based Abstraction for Markov Decision Processes](https://www.prismmodelchecker.org/papers/qest06.pdf)、
[Stochastic Games for Verification of Probabilistic Timed Automata](https://qav.cs.ox.ac.uk/bibitem.php?key=KNP09d)

### 激活顺序只能按博弈顽固集条件压缩

Bonneland 等证明了适用于双人可达博弈的 stubborn-set reduction。它删除的是可证明独立的
交错，不是低分动作。Warmachine 中两个激活只有在碰撞、LOS、让路/挡路、资源、持续
效果、击杀三阶段、corpse/soul、reaction、once-per-turn 和中间终局观察全部可交换时，
才有资格折叠顺序。

来源：
[Stubborn Set Reduction for Two-Player Reachability Games](https://lmcs.episciences.org/7278/)

### 对称压缩必须有自同构证明

概率模型中的 orbit quotient 只有在置换保持转移、概率和目标标签时才与原模型双模拟。
Warmachine 可安全尝试同 Unit 内完全同状态模型的重标号和真实地图对称；attachment、
不同伤害、不同装备、身份触发和不对称目标都会破坏这种对称。

来源：
[Symmetry Reduction for Probabilistic Model Checking](https://www.prismmodelchecker.org/papers/cav06.pdf)

### 近似相似度只能给误差界

Ferns、Panangaden、Precup 的双模拟度量把“相似”转换为值函数误差界，而不是零误差等价。
因此未来若用几何距离、特征向量或学习嵌入聚类，只能产生声明误差下的近似结果，不能进入
严格硬合并。

来源：
[Metrics for Finite Markov Decision Processes](https://arxiv.org/abs/1207.4114)、
[Metrics for Markov Decision Processes with Infinite State Spaces](https://arxiv.org/abs/1207.1386)

## 当前实现审计

### 已经安全实现的部分

`src/search/continuation-strategy-comparison-worklist-v1.mjs` 当前：

- 保存全部 142 个具体状态类和动作身份；
- 精确后继指纹仍为 142 个，不做状态合并；
- 七个动作形状组只把首轮比较任务从组内全对比较降为代表挑战；
- 每个比较任务都声明连续参数、状态关系、动作对应、终局目标、Chance、对手回应、历史和
  深层延续证明尚需完成；
- 明确输出 `candidateGroupingIsStrategyEquivalence=false`、`hardMergeAllowed=false`、
  `hardPruneAllowed=false`；
- 当前 `hardMergeCount=0`、`hardPruneCount=0`、
  `effectiveStrategyQuotientComplete=false`。

因此当前行为是保守的。它减少的是“先比较哪些对”，没有减少规则或策略分母。

### 已有但尚未接入真实延续图的算法

`src/search/goal-conditioned-strategy-quotient-v1.mjs` 已实现一个有限时域、显式有限博弈上的：

- Max/Min/Chance/terminal 四类状态；
- 精确有理概率分布和基于流的分布 coupling；
- 最大交替 simulation 与概率交替 bisimulation 固定点；
- 目标向量逐维支配；
- 可达性、交替支配、乐观上界和 `unresolved` 处置账本；
- 所有未决项进入正向补集挑战队列；
- 只有规则商、终局根、目标、策略语义、对手回应、Chance 和策略上下文全部闭合时，才允许
  `effectiveStrategyQuotientComplete=true`。

这证明项目已有正确方向的算法骨架，但它只能处理调用者已经完整提供的有限博弈。当前真实
延续证据还缺 6318 个离散槽、连续动作域、完整对手回应、Chance 和深层后继，不能把这些
闭合布尔值由调用者口头设为真。

### 当前不足

1. 动作形状组只覆盖组内代表挑战；它没有证明跨组一定不等价，也没有搜索跨组支配。
2. 形状哈希含动作族等调度字段，但尚未证明这些字段构成策略保持的不变量分区。
3. 当前比较输入只观察首个分页；不同深层状态可能在首屏相同，也可能首屏不同但目标结果
   等价。
4. 仍有连续位置、路径同伦、规则事件穿越顺序和多模型 Unit 几何未形成完整 `Q_rule`。
5. 对手完整回合与随机分支尚未闭合，无法计算保证值或签发交替关系。
6. Engine 规则源已变化，旧 Host 回执 `cae4bd34...` 下的证据不能对当前 Host
   `f313823e...` 签发任何新策略证书。

## 应采用的生产算法

### 第一层：不损失信息的账本

所有具体状态、动作、拒绝、Chance 质量和未展开槽都写入不可变账本。内容哈希完全相同的
状态可以共享计算，但每条来边和历史身份仍可追溯。这一层不需要策略等价。

### 第二层：候选分区

使用 owner、剩余时域、目标合同、公开历史、信息集、终局标签和规则可观察谓词建立初始
分区。动作形状、几何拓扑和模型对称只用于提高候选命中率。候选分区不得修改值或分母。

### 第三层：精确 reduction 证书

按从便宜到昂贵的顺序尝试：

1. 完全相同状态的 transposition；
2. 带置换映射的 symmetry automorphism；
3. 带依赖闭包、交换后继和中间观察证明的 game stubborn set；
4. 在完整有限后继图上的概率交替双模拟固定点。

每个合并类保存代表、成员、动作双向映射、对手量词、概率 coupling、后继类和失效键。

### 第四层：非等价状态的保守界

对每个未决类维护：

```text
strict 可行策略下界
可采纳乐观上界区域
未展开 Chance 质量
未闭合对手回应
抽象成员选择不确定性
```

只有整个乐观区域被已有 strict Pareto 下界逐维支配时才可剪枝。LLM、skill、ranker、历史
胜率和代表成员结果只能改变调度优先级。

### 第五层：双向 CEGAR

- 反向包络内部：strict 正向重放发现伪路线，提取区分谓词并拆组；
- 反向包络外部：从合法初态挑战补集，发现遗漏好路线后扩展反向义务语言；
- 没有反例不等于证明；预算停止保留 `unresolved` 和完整上界。

### 第六层：值求解与报告

值求解只消费已认证商和未决区间。报告分开显示：

```text
exact_revisit_shared
symmetry_merged
por_interleaving_reduced
bisimulation_merged
dominance_pruned
upper_bound_pruned
proven_unreachable
unresolved
```

用户必须能从每个缩减类展开到原始具体动作；否则只能作为求值加速，不得称为完整可解释
策略集合。

## 实施顺序

1. 先完成 Ticket 23 当前规则内核认证，冻结新的 Host 回执。
2. 用 Ticket 20 补全连续动作、Unit、回应、Chance 和后继稳定的 `Q_rule`。
3. 重新生成当前 Host 下的最小真实延续基线，不复用旧回执下的值或等价结论。
4. 将比较工作表接到完整有限博弈构造器；初始形状组仍只负责调度。
5. 为 symmetry、POR、bisimulation 和支配分别签发独立证书，禁止共享一个模糊的
   `equivalent=true`。
6. 对无法签证的成员计算上下界并进入 CEGAR/补集队列。
7. 在可全量穷举 micro 域对照“不开 reduction”的真值，再在固定 Cryx/Fane 任务上报告
   reduction 比、界宽和未决分母。
8. 只有 `unresolved=0`，或用户接受有明确误差/区间的近似合同，才发布最终策略值。

## 对当前 142 类的即时裁决

- 七个动作形状组：保留，身份为 `scheduling_candidate_group`。
- 135 个代表挑战：可继续作为未来新 Host 基线上的首批任务，但旧收据结果不能续签。
- 4324 个组内候选对：不是必须全部 strict 展开；可由固定点分区细化和证书批量排除。
- 跨组候选对：若没有不变量不相容证明，仍需进入支配/界挑战域。
- 6318 个未展开槽：不得消失；在 `Q_rule` 完成前保持 unresolved，而不是盲目全部继续跑。
- 当前可发布策略值：否；整局仍只能保持守恒区间 `[0,1]`。

