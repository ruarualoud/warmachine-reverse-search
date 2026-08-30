# 目标条件化策略有限商文献调研 V1

## 研究问题与范围

本报告严格评估下面这个命题：

> 对一个包含我方选择、对手选择和随机结果的 Warmachine 搜索问题，能否构造一个目标条件化的有限策略商，使它包含全部“有效策略类”，并据此安全地剪掉其余空间？

这里讨论的不是仅把连续坐标、路径或阵型有限化。合法几何有限商只回答“哪些具体状态和动作具有相同规则行为”；本报告关心更强的问题：合并或删除状态、动作、历史和策略之后，是否仍保留给定目标下的全部有效战略选择。

报告只采用原始论文、作者公开论文或正式会议页面。为避免把项目设计包装成文献定理，全文使用两类标记：

- **文献结论**：来源论文明确证明或陈述的结果。
- **本项目推论**：将文献结果用于 Warmachine 反向搜索后得到的设计要求，不是来源论文原文中的定理。

## 结论摘要

### 严格结论

1. **无条件的“有限商包含全部有效策略类”不成立。** “有效”必须先绑定目标集合、价值维度、时间域、初始状态集合、对手语义、Chance 语义、允许的策略记忆和随机化类型。更换这些条件后，原商关系未必仍保值。
2. **只保留最优值或至少一个最优策略，不能推出保留全部有效策略类。** MDP 文献明确区分 model、all-policy value、optimal-Q、optimal-action 和 policy abstractions；这些抽象保留的对象不同，较弱的 policy abstraction甚至可能使抽象最优策略在原 MDP 中次优。
3. **双人博弈必须保留交替量词。** 我方动作的匹配方向与对手动作的匹配方向相反；有 Chance 时还必须提升到概率分布。普通单方 simulation、状态相似度或单步合法性相同不足以证明策略保持。
4. **多目标下不能用单一 ranker 分数替代 Pareto 保留。** 精确 Pareto 曲线可能含无限多个点，有限 MDP 的精确 Pareto 表示也可能是超多项式规模；随机化和记忆在 MDP 与随机博弈中都可能是必要的。
5. **反向包络若要支持完整性声明，必须是潜在有效策略集合的过近似。** 欠近似只能证明“找到的路线存在”，不能证明未找到的空间无有效策略。
6. **先反向、再正向只有在正向阶段能独立挑战反向包络的补集时才有纠错作用。** 若正向搜索只在反向包络内部运行，它只能排除伪反向路线，不能发现反向生成器漏掉的优解。
7. **有限预算正向搜索没有找到反例，不是完整性证明。** 只有补集被完整检查，或其可采纳乐观上界已被一个具体可行的 Pareto 下界前沿支配，才能关闭该补集。

### 条件化可行性判断

在以下条件同时成立时，可以构造一个有限或有限符号表示的目标条件化策略商，并证明它保留目标基下的全部 Pareto 非支配策略结果：

- 底层规则行为域已经形成完整、转移稳定的有限商；
- 搜索时域有限，或无限时域被一个有证明的固定点/停止条件处理；
- 玩家动作族和每次转移的 Chance 支持在规则商上有限且完整；
- 目标基、奖励/成本向量和历史可观察量固定；
- 双方策略的量词、信息结构、记忆和随机化语义固定；
- 策略保证集合及其并、交、凸组合、概率提升和支配检查在所选表示中有精确有限表达，或策略域本身被证明为有限；
- 合并使用目标保持的概率交替双模拟，或使用有方向证明的交替支配；
- 删除分支只依赖不可达证明、交替支配证明或可采纳上界证明；
- 全部未证明部分保持为 `unresolved`，并进入独立的补集反例搜索。

这是一条**本项目条件化命题**，不是现有某一篇论文直接覆盖完整 Warmachine 语义的现成定理。

## 一、先定义“全部有效策略类”

设一个有限时域双人随机博弈为：

```text
G = (S, S_max, S_min, S_chance, A, P, H)
```

其中：

- `S_max` 是我方决策状态；
- `S_min` 是对手决策状态；
- `S_chance` 是规则随机结算状态；
- `P` 给出完整概率分布；
- `H` 是搜索时域；
- 状态还必须包含规则可观察的回合、激活、资源、伤害、持续效果、位置、场景和历史字段。

再固定目标基：

```text
B = (terminal formulas, objective vector, horizon,
     initial-state set, information model,
     strategy memory class, randomisation class)
```

以下统一把所有目标坐标规范成“越大越好”；成本、风险和耗时应先取负值或转换为对应效用坐标。

对我方策略 `pi`，更稳妥的对象不是一个标量，而是它面对全部对手策略时可保证的向下闭合结果集合：

```text
Guarantee_B(pi, s)
  = {v | for every opponent strategy sigma,
         Outcome_B(pi, sigma, s) >= v componentwise}
```

本报告将“有效策略”定义为：其保证集合没有被另一个可行策略严格包含。两个策略只有在给定 `B` 下具有相同的保证集合和相同的后续可观察能力时，才可进入同一个策略商类。

### 本项目推论

- 若只比较胜率，可能合并一个擅长刺杀和一个擅长场景得分的策略；一旦报告需要解释胜利来源，这个合并就失效。
- 若只比较终局向量，可能合并两个当前结果相同、但面对后续对手回应集合不同的状态；多回合扩展时这个合并也会失效。
- 若允许策略随机化，不同混合比例可能产生连续多个 Pareto 点。因此“有限商”未必是有限策略列表，也可能必须是有限状态图加凸多面体、区间或其它有限符号表示。
- 若所谓“全部有效”包含未来尚未声明的任何主观偏好，则唯一普遍安全的商接近完整规则行为双模拟，无法期待强策略剪枝。

## 二、MDP 中的 value/policy preserving abstraction

### 2.1 不同抽象保留的对象不同

Li、Walsh 与 Littman 把 MDP 状态抽象分为多种强度：

- `phi_model` 保留单步奖励和到各抽象类的转移概率；
- `phi_Qpi` 保留所有策略的状态动作值；
- `phi_Q*` 保留最优状态动作值；
- `phi_a*` 保留最优动作及其值；
- `phi_pi*` 只要求同一抽象类存在共同最优动作。

论文的 Theorem 2 给出这些抽象从细到粗的链，Theorem 3 证明前四类的抽象最优策略可在原 MDP 中保持最优，同时给出 `phi_pi*` 可能在原 MDP 中次优的反例。[Li、Walsh、Littman，Towards a Unified Theory of State Abstraction for MDPs](https://thomasjwalsh.net/pub/aima06Towards.pdf)

**文献结论：** “知道各状态存在共同最优动作”仍可能不足以让聚合后的模型正确地产生原问题最优策略；保留一个最优决策与保留模型、所有策略值或所有动作值不是同一保证。

**本项目推论：**

- 若目标是“全部有效策略类”，至少不能只建立 `Q*` 或共同最优动作意义上的商，因为它们允许丢掉其它 Pareto 非支配策略。
- 若策略商还要支持换目标、换权重或解释被放弃动作，就需要比单目标 `Q*` 更强的目标向量与转移保持。
- 规则行为商可以借鉴 `phi_model`：同类状态必须具有相同即时规则结果和到后续商类的概率。但这只奠定执行语义，不自动产生策略剪枝。

### 2.2 近优策略可表示不等于全部策略保留

Abel 等研究状态抽象与 options 的组合。其主要结果给出多类抽象的 value-loss 上界；Theorem 2 说明若抽象能表示全局 `eta`-近优策略，则每个抽象状态至少要有一个 `eta`-近优 option。论文明确把问题定义为是否还能表示高价值或近优策略，而不是保留原策略空间中的每个有效策略。[Abel 等，Value Preserving State-Action Abstractions](https://proceedings.mlr.press/v108/abel20a.html) [论文 PDF](https://proceedings.mlr.press/v108/abel20a/abel20a.pdf)

**文献结论：** 限制动作集合会破坏可表示策略；保留 primitives 可以恢复全部原策略的表示能力，但也恢复原分支规模。论文的保证是“至少存在近优可表示策略”及其损失界。

**本项目推论：** 若把反向生成的宏动作当成唯一动作集合，证明其中存在一条好路线仍不能证明其它有效动作类已被包含。每个被删原子动作族必须有等价、支配或上界证书。

### 2.3 MDP 文献对本命题的边界

MDP 结果能支持三件事：

1. 明确写出抽象究竟保留 model、value、optimal action 还是 policy；
2. 对近似抽象给出量化 value-loss，而不是把相似度当作零损失；
3. 说明动作抽象必须证明仍能表示所需策略。

它不能直接支持两件事：

- MDP 没有对手的反向量词，不能直接证明双人 Warmachine 策略保持；
- 单标量最优值保持不能直接推出多目标 Pareto 前沿保持。

## 三、alternating simulation/bisimulation 与双人策略保持

### 3.1 非随机交替系统的量词结构

Alur、Henzinger、Kupferman 与 Vardi 定义 alternating simulation。若 `t` 模拟 `s`，其核心条件是：

```text
for every coalition move from s,
  there exists a matching coalition move from t,
    such that for every opposing move from t,
      there exists a matching opposing move from s,
        and the successor pair remains related.
```

论文给出博弈解释，并证明 alternating simulation 可由最大固定点计算；alternating bisimulation 对相关 ATL 公式给出双向逻辑保持。[Alur 等，Alternating Refinement Relations](https://www.cs.huji.ac.il/~ornak/publications/concur98.pdf)

**文献结论：** 双人策略能力的保持依赖 `forall-exists-forall-exists` 的交替结构。普通 transition-system simulation 的单层“每条边有一条匹配边”不足以表达双方选择。

**本项目推论：** 对 `q` 是否至少不差于 `p` 的支配关系，量词方向必须随节点所有者变化：

- 我方节点：`p` 的每个候选动作都要能被 `q` 中一个不差动作匹配；
- 对手节点：`q` 暴露给对手的每个回应都要能在 `p` 中找到对应回应，避免 `q` 隐藏一个更坏的对手选择；
- 终局标签、时序、历史和目标向量必须兼容；
- 等价合并必须由同一个对称关系直接满足 alternating bisimulation 条件；论文明确指出“两边分别存在 simulation”一般弱于 bisimulation。单向 relation 只允许有方向的支配剪枝。

### 3.2 Chance 与混合策略需要分布提升

Zhang 与 Pang 的 probabilistic alternating simulation 把关系提升到状态分布，并在两名玩家都可用 mixed action 的概率博弈结构上计算最大 simulation。论文说明 PA-simulation 保留相应 PATL 片段，并把“我方混合动作存在匹配、对方所有动作均被处理、后继分布由 lifted relation 关联”作为核心条件。[Zhang、Pang，An Algorithm for Probabilistic Alternating Simulation](https://arxiv.org/abs/1106.1978) [University of Luxembourg 论文记录](https://orbilu.uni.lu/handle/10993/196)

**文献结论：** Chance 后继不能只比较支持集合或期望值；概率关系需要对分布进行 lifting。对手动作与混合策略仍位于分布提升之外的交替量词中。

**本项目推论：**

- 两条攻击路线即使命中期望伤害相同，只要致死、Tough、触发、偏差或后续状态的概率分布不同，就不能仅凭期望值合并。
- 每个非零概率 outcome 必须进入 Chance 账；被阈值跳过的概率质量只能进入 `pruned/unresolved mass`，不能消失。
- 玩家选择的位置、路线、目标或资源分配不是 Chance，不得按采样频率或几何面积赋概率。

### 3.3 单向保胜与双向完整之间的差别

de Alfaro、Godefroid 与 Jagadeesan 指出，传统保守 game abstraction 通常只能对一方的策略存在性提供单向结论；其三值博弈用 `may`、`must` 和 `unknown` 区分抽象不确定性，并以 alternating refinement 保持双方的 alternating mu-calculus 公式。[de Alfaro、Godefroid、Jagadeesan，Three-Valued Abstractions of Games](https://luca.dealfaro.com/papers/04/lics04.pdf) [LICS 官方论文页面](https://www.lfcs.inf.ed.ac.uk/events/lics/2004/AlfaroGodefroidJaga-ThreeValuedAbstract.html)

**文献结论：** 一个只添加抽象 `may` 行为的保守模型适合证明某些全称性质，但对存在性和嵌套策略量词可能不精确甚至不适用；三值结果把无法判定的部分保留为 unknown。

**本项目推论：** 策略商的完整性报告至少需要三值处置：

```text
retained/proved       已保留且有策略保持证据
pruned/proved         有不可达、支配或上界证据
unresolved            当前抽象或预算不能判定
```

把 unknown 当作输、不可达或无效策略会破坏完整性。

## 四、Pareto 多目标策略保留

### 4.1 精确 Pareto 前沿通常不是一个小列表

Etessami、Kwiatkowska、Vardi 与 Yannakakis 对多目标 MDP 证明了给定阈值向量的可达性可以判定并构造策略，但策略可能需要随机化和记忆。论文还证明，即使只有两个 reachability 目标，有限 MDP 的 Pareto 曲线也可具有超多项式数量的顶点；随机化可使曲线包含无限多个点，因此论文重点给出 epsilon 近似 Pareto 曲线。[Etessami 等，Multi-Objective Model Checking of Markov Decision Processes](https://qav.cs.ox.ac.uk/papers/tacas07.pdf)

**文献结论：**

- 单独优化每个目标，不能恢复目标之间的全部 trade-off；
- 一个固定加权和也不等于保留整个 Pareto 策略集合；
- exact Pareto 的输出规模本身可能超多项式，近似前沿与精确前沿是不同声明。

### 4.2 双人随机博弈中的 Pareto 量词

Chen、Forejt、Kwiatkowska、Simaitis 与 Wiltsche 把双人随机博弈中的多目标满足写成：存在 Player 1 策略，使得对任意 Player 2 策略，各目标概率或期望均达到阈值。其 stopping-game 结果给出 epsilon-Pareto 近似；一般多目标随机博弈中，Player 1 的获胜策略可能需要随机化和无限记忆，问题复杂度也显著高于 MDP。[Chen 等，On Stochastic Games with Multiple Objectives](https://qav.cs.ox.ac.uk/papers/mfcs13.pdf) [Chen 等，Synthesis for Multi-Objective Stochastic Games](https://qav.cs.ox.ac.uk/papers/qest2013.pdf)

**文献结论：** 多目标随机博弈不能默认 stationary deterministic policy 足够；Pareto 前沿的固定点对 Player 1、Player 2 和 stochastic state 使用不同运算。

**本项目推论：** Warmachine 的策略结果应至少保留一个向量或向下闭合集合，而不是一个提前固定权重的总分。可作为目标基候选的维度包括：

- 刺杀胜利保证与场景胜利保证；
- 胜利时间/回合；
- VP 轨迹和终局差；
- 双方 Leader 生存风险；
- 兵力、资源、控制与后续合法回应包络；
- unresolved Chance、对手回应和规则域债务。

其中哪些维度最终进入“有效”定义必须由任务 receipt 固定。新增目标维度后，旧策略商必须失效或重新证明。

### 4.3 精确与近似声明必须分开

可以有三种不同产品：

1. **精确 Pareto 保持商**：保留目标基下全部非支配保证集合，可能很大；
2. **epsilon-Pareto 商**：每个真实结果都有一个在声明误差内的保留结果；
3. **启发式代表集**：只保留若干有趣策略，没有全覆盖保证。

**本项目推论：** 三者的报告和门禁必须分开。不能把 epsilon 近似或有限代表集描述成“全部有效策略类”。

## 五、CEGAR 与反例精化

### 5.1 CEGAR 的实际保证

Clarke、Grumberg、Jha、Lu 与 Veith 的 CEGAR 从一个具体系统行为的上近似开始。抽象模型包含具体系统的全部相关行为，也可能包含伪行为；若抽象反例无法在具体模型中实现，就根据最短伪前缀拆分抽象状态并重试。[Clarke 等，Counterexample-Guided Abstraction Refinement](https://web.stanford.edu/class/cs357/cegar.pdf) [正式 DOI 页面](https://doi.org/10.1007/10722167_15)

Seipp 与 Helmert 将同一思想用于最优经典规划：先求抽象最优路线，再检查它为什么不能在具体任务中执行，并精化到相同失败不再出现。[Seipp、Helmert，Counterexample-Guided Cartesian Abstraction Refinement](https://ojs.aaai.org/index.php/ICAPS/article/view/13605)

**文献结论：** CEGAR 消除的是抽象过近似带来的伪行为。它依赖初始抽象的 sound over-approximation；如果初始抽象漏掉真实行为，检查抽象内部反例并不能自动找回遗漏。

### 5.2 对“先反再正”的严格解释

**本项目推论：** 项目需要两个不同的正向过程：

1. `concretization forward replay`：在反向包络内部，用 strict Host 检查抽象路线是否真实；失败用于拆分包络。
2. `complement challenge search`：从真实开局独立搜索反向包络的补集，优先扩展可能击败当前 Pareto 下界的区域；找到更好路线时，说明反向必要条件或商分区不完整，必须精化。

只有第一个过程时，系统可以不断证明“我生成的候选里有些是真的”，却不能发现一个从未被反向生成的优解。

### 5.3 反例未出现不等于没有反例

正向补集搜索必须记录覆盖分母。停止时每个补集类只能进入：

- 已由完整正向枚举关闭；
- 已由可采纳上界关闭；
- 找到反例并触发精化；
- 预算停止，继续 `unresolved`。

有限采样、随机 rollout、MCTS 没找到反例，都只能提供经验置信，不能提供此处所需的完备性证明。

## 六、optimistic upper-bound pruning

### 6.1 文献中的乐观上下界

Buşoniu 与 Munos 的 optimistic planning 在 closed-loop MDP policy tree 上维护 policy class 的下界和上界。算法沿最大 upper bound 的 policy class 展开，并在有限展开后用 lower bound 选择动作；论文给出相对于展开次数和 near-optimality exponent 的近优损失界。[Buşoniu、Munos，Optimistic Planning for Markov Decision Processes](https://proceedings.mlr.press/v22/busoniu12.html) [论文 PDF](https://proceedings.mlr.press/v22/busoniu12/busoniu12.pdf)

Torralba 与 Hoffmann 在最优经典规划中使用 goal-respecting simulation dominance：若一个已见状态能模拟另一个状态，且到达成本不高于后者，则后者可被剪掉而不损失最优性。[Torralba、Hoffmann，Simulation-Based Admissible Dominance Pruning](https://www.ijcai.org/Proceedings/15/Papers/241.pdf)

**文献结论：**

- 乐观值必须是真实最优值的 upper bound，才可用于安全排除不可能改进的区域；
- simulation dominance 的安全性依赖目标保持、后续转移模拟和路径成本条件；
- 这些论文分别处理 MDP 或单方最优规划，不能直接替代双人多目标证明。

### 6.2 多目标补集的安全剪枝条件

设 `U(C)` 是一个未展开策略类 `C` 的可采纳乐观结果区域，`L` 是已由 strict 具体策略认证的可行向下闭合 Pareto 下界。一个补集类只有在满足下面条件时才可硬剪：

```text
for every u in U(C),
  there exists l in L such that l >= u componentwise
```

**本项目推论：**

- 不能只比较一个标量上界；这会删除在低权重维度上仍非支配的策略。
- 我方尚未展开的动作必须按可能达到理论最大值处理，否则 upper bound 会偏低。对手尚未展开的回应若暂时从 `min` 集合中移除，会使值偏高，仍可作为松的 upper bound，但绝不能据此形成 lower bound 或鲁棒策略证明。
- 未展开 Chance 质量必须按该维最有利的理论结果计入 upper bound；不能直接丢弃质量。若某一维未知，应给该维理论最大上界，而不是零或样本均值。这样上界可能很松，但不会误剪。
- strict 可行路线形成 lower bound；抽象路线、未闭合对手路线或幸运骰 witness 不能作为可行保证前沿。

## 七、反向包络的过近似与完整性边界

### 7.1 为什么必须是过近似

抽象解释与 CEGAR 的共同 soundness 结构是：具体行为集合包含于抽象行为的 concretization 中。Clarke 等明确把抽象描述为原程序的 upper approximation；de Alfaro 等进一步说明在博弈中需要用 may/must/unknown 和 alternating refinement 处理不同策略量词。

**本项目推论：** 若 `Eff_B` 表示目标基 `B` 下全部有效具体策略类，反向搜索输出包络 `E_B` 要支持完整性，首先必须证明：

```text
Eff_B subset_of concretize(E_B)
```

反向只找到若干好路线时，实际得到的是：

```text
strict_discovered_B subset_of feasible_B
```

这是可行路线集合的欠近似，其中还可能包含被其它路线支配的策略。它能证明路线存在，但两种包含方向完全不同，不能互换。

### 7.2 过近似包络的归纳义务

对有限时域 `h`，反向包络至少要满足以下归纳义务：

1. **终局根完备**：目标基允许的全部刺杀、场景得分、固定轮结束及并列处理终局类都被覆盖；根不能固定无关模型的偶然坐标。
2. **我方选择完备**：任何可能产生非支配保证结果的合法动作类，要么进入前像，要么有等价/支配/上界证书。
3. **对手回应完备**：保留策略必须面对每一个合法对手回应，不能只保留有利回应。
4. **Chance 完备**：每个非零概率 outcome 的质量守恒；低概率只可进入显式 pruned mass，并影响最终界。
5. **历史完备**：资源、激活、触发顺序、场景结算和策略记忆所需历史不得在合并中丢失。
6. **连续域完备**：底层规则商必须证明同一 cell 内 Host 可观察谓词和后继商类稳定；采样代表不是完整性证明。
7. **目标必要条件有证明**：目标条件可缩域，但每个 hard condition 必须证明为全部有效策略的必要条件；经验模式和 skill 只能排序。

### 7.3 每个被删除类的处置账

完整性门禁应要求所有具体或符号动作类落入以下互斥处置之一：

| 处置 | 所需证书 | 是否可从商中删除 |
| --- | --- | --- |
| `retained` | 在包络内，后续仍待求值 | 否 |
| `equivalent` | 同一对称关系在目标、历史、概率和后续动作上满足概率交替双模拟 | 可与代表合并 |
| `dominated` | 全目标向量、成本和对手量词上的交替支配，且保留支配代表 | 可删除被支配类 |
| `unreachable` | 当前 Host/规则商上的完整不可达证明 | 可删除 |
| `upper_bound_pruned` | 可采纳乐观结果区域被 strict 可行 Pareto 下界完全支配 | 可删除 |
| `counterexample` | 补集找到更好或未被包络表示的 strict 路线 | 不可删除，必须精化 |
| `unresolved` | 预算、规则、几何、对手或 Chance 未闭合 | 不可删除，禁止完整性声明 |

不存在“未生成”“ranker 分低”“不符合常见阵型”“LLM 不喜欢”这类可硬删除处置。

## 八、本项目可主张的条件化保持命题

下面不是文献原定理，而是由前述结果组合出的**本项目待证明命题**。

### 命题草案

固定一个 receipt-bound 目标基 `B`。若：

1. `Q_rule` 是具体 Warmachine 状态/动作域的有限、转移稳定、概率质量保持的规则行为商；
2. `B` 固定有限时域、终局公式、完整目标向量、初始状态集合、双方信息结构、策略记忆和随机化类别；
3. 反向终局根覆盖 `B` 的全部终局类别；
4. 反向 predecessor 对我方、对手和 Chance 使用正确的交替/概率量词，并产生 `Eff_B` 的过近似；
5. 策略等价由目标保持的概率交替双模拟给出；
6. 策略支配对完整目标保证集合、路径成本和后续对手响应成立；
7. upper-bound pruning 使用可采纳向量区域，并仅由 strict 可行 Pareto lower frontier 关闭；
8. 处置账中没有 `unresolved`，补集也已由完整正向检查或可采纳上界关闭；
9. Pareto 保证集合、概率提升和上下界运算在选定数据结构中具有精确、闭合的有限符号表示；

则对每个具体 Pareto 非支配策略 `pi`，商中存在一个保留策略类 `q`，其具体实现面对全部允许的对手策略和 Chance 结果时，保证集合不差于 `pi`。因此商保留 `B` 下全部有效**结果类**。

### 这个命题没有声称什么

- 不保留每条动作文本不同但战略结果相同的具体路线身份；这些路线可被商合并。
- 不保留目标基 `B` 未声明的未来偏好。
- 不保证商是小的、可在多项式时间计算，或显著优于完整搜索。
- 不保证一般无限时域、多目标随机博弈有有限记忆最优策略。
- 不把 epsilon-Pareto 近似称为 exact Pareto 保持。
- 不把一条 strict witness、有限 rollout 或有限补集挑战称为完整性证明。

### 输出规模边界

多目标 MDP 文献已经给出精确 Pareto 曲线超多项式规模的有限实例，并说明曲线可有无限多个点。因此即使上述命题成立，仍可能发生两种情况：

- 商状态有限，但每个状态的可达保证集要用凸多面体或其它符号对象表示；
- 真正非支配策略类很多，算法不能在不改变 exact 声明的前提下继续大幅压缩。

换言之，策略有限商是一种语义正确性目标，不是搜索空间必然很小的定理。

## 九、对 Warmachine 反向搜索架构的直接要求

### 9.1 两层商不能混为一层

```text
Q_rule
  规则行为商：合法动作、路径事件、触发、概率和后继稳定

Q_goal(B)
  目标条件化策略商：Pareto 保证集合、交替支配、上下界和历史语义
```

`Q_rule` 可以跨任务复用；`Q_goal(B)` 随任务目标、地图、军表、时域和策略语义变化。前者完成不代表后者完成。

### 9.2 反向与正向的职责

```text
reverse over-approximation
  构造全部潜在有效策略的目标条件化包络

strict concretization
  排除包络中的伪路线并产生可行 lower bound

forward complement challenge
  搜索包络之外、仍有可能击败当前前沿的分支

CEGAR refinement
  用两类反例拆分规则商、必要条件或策略商
```

正向阶段不是简单“给反向结果盖章”。它既要验证包络内部，也要独立挑战包络外部。

### 9.3 推荐的完成门禁

策略商只有在以下 receipt 同时存在时才可标记 `complete`：

- 完整规则行为商与 Host source parity；
- 目标基及策略语义 receipt；
- 终局根分母 receipt；
- 全动作、全对手、全 Chance predecessor 分母 receipt；
- 等价/支配固定点及每条 witness receipt；
- Pareto lower frontier 的 strict route receipt；
- 每个上界剪枝的 admissibility receipt；
- 补集挑战范围和完成 receipt；
- 零 `unresolved` 的 disposition conservation receipt。

任何一项缺失时，报告最多可以说“发现了若干严格可执行的好策略”“给出值区间”或“给出 epsilon 近似”，不能说“包含全部有效策略商”或“对局最优”。

## 十、最终判断

### 可以成立的版本

目标条件化策略商可以在一个明确、receipt-bound、有限或可有限符号化的双人随机博弈上，借助：

- 完整规则行为商；
- 概率交替 simulation/bisimulation；
- 多目标向下闭合 Pareto 保留；
- CEGAR 具体化与补集反例精化；
- 可采纳乐观上界和 strict 可行下界；

形成一个有条件的完整性证明。

### 不能成立的版本

下面任一做法都不足以证明“包含全部有效策略类”：

- 只把连续几何分成有限 cell；
- 只保留一个最优标量值或一个最优动作；
- 只从若干终局反向找到路线；
- 只在反向包络内做 strict replay；
- 只用 ranker、skill、LLM 或经验阵型删动作；
- 只用有限正向搜索没有找到更好路线；
- 把未知对手回应或低概率 Chance 结果当作失败；
- 把 epsilon-Pareto 或代表构筑集称为 exact 全覆盖。

### 对当前开发的判定

本调研支持继续开发“规则行为商 + 目标条件化策略商 + 补集挑战 CEGAR”的三段式架构，但**文献本身不能证明当前实现已经包含全部有效策略类**。在上述 receipt、量词、Pareto 和补集门禁落地前，正确状态仍应是：

```text
strategyQuotientComplete = false
allEffectiveStrategyClassesPreserved = unproven
unresolvedComplementMustRemainVisible = true
```

## 核心原始来源索引

1. [Li、Walsh、Littman：Towards a Unified Theory of State Abstraction for MDPs](https://thomasjwalsh.net/pub/aima06Towards.pdf)
2. [Abel 等：Value Preserving State-Action Abstractions](https://proceedings.mlr.press/v108/abel20a.html)
3. [Alur 等：Alternating Refinement Relations](https://www.cs.huji.ac.il/~ornak/publications/concur98.pdf)
4. [Zhang、Pang：An Algorithm for Probabilistic Alternating Simulation](https://arxiv.org/abs/1106.1978)
5. [de Alfaro、Godefroid、Jagadeesan：Three-Valued Abstractions of Games](https://luca.dealfaro.com/papers/04/lics04.pdf)
6. [Etessami 等：Multi-Objective Model Checking of Markov Decision Processes](https://qav.cs.ox.ac.uk/papers/tacas07.pdf)
7. [Chen 等：On Stochastic Games with Multiple Objectives](https://qav.cs.ox.ac.uk/papers/mfcs13.pdf)
8. [Chen 等：Synthesis for Multi-Objective Stochastic Games](https://qav.cs.ox.ac.uk/papers/qest2013.pdf)
9. [Clarke 等：Counterexample-Guided Abstraction Refinement](https://web.stanford.edu/class/cs357/cegar.pdf)
10. [Seipp、Helmert：Counterexample-Guided Cartesian Abstraction Refinement](https://ojs.aaai.org/index.php/ICAPS/article/view/13605)
11. [Buşoniu、Munos：Optimistic Planning for Markov Decision Processes](https://proceedings.mlr.press/v22/busoniu12.html)
12. [Torralba、Hoffmann：Simulation-Based Admissible Dominance Pruning](https://www.ijcai.org/Proceedings/15/Papers/241.pdf)
