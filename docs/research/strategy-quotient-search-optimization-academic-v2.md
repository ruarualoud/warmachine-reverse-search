# 连续几何随机对抗博弈的有限策略商与搜索优化：学术调研 V2

## 0. 研究问题、来源纪律与结论口径

本报告研究下面这个严格问题：

> 对同时包含连续位置/路径、回合制双方选择、随机结算、历史依赖和多目标结果的 Warmachine，怎样构造有限或有限符号表示的策略商，尽量保留给定任务下全部“有效策略”；反向可达、几何/拓扑约化、概率交替模拟/双模拟、CEGAR、partial-order reduction、概率 POR、stubborn sets、对称约化、BDD/MTBDD、参数/区间抽象、branch-and-bound 和抽象上下界分别能提供什么严格保证？

全文只使用论文原文、作者/大学论文页、模型检验器论文页和正式技术报告。每个结论分为：

- **文献保证**：来源明确证明的对象和前提；
- **Warmachine 落地推论**：把该结果用于当前项目时应承担的证明责任；
- **不能保证**：禁止从该技术名称或实验效果外推的结论。

这里的“完整”不是“脚本跑完”，也不是“找到一个最优动作”。本报告采用三个不同层次：

1. **规则行为完整 `Q_rule`**：每个具体合法动作、对手回应、Chance 结果和规则可观察后继，都有有限商中的代表。
2. **目标结果完整 `Q_goal(B)`**：对固定任务合同 `B`，每个可能 Pareto 非支配的具体策略，都有一个保证结果不差的商内代表。
3. **具体路线身份完整**：每条坐标、路径和激活次序不同的具体历史均单独保存。当前项目不需要这一最强、通常也最昂贵的层次；等价路线可合并，但必须可追溯到代表和证明。

## 1. 核心判断

### 1.1 无条件的有限完整策略商不存在一般保证

一般 hybrid automata 的可达性存在可判定与不可判定的边界；Henzinger、Kopke、Puri 与 Varaiya 给出的结果说明，只有受限动态类别才保证可判定，不能从“棋盘有限、回合有限”直接推出任意连续规则模型都有可计算的有限双模拟。[Henzinger 等，What's Decidable about Hybrid Automata?](https://doi.org/10.1006/jcss.1998.1581)

有限精确双模拟只在额外结构下成立。例如：

- timed automata 依赖有限常数集合，可用 region equivalence 得到保持 time-abstract 行为的有限区域图；[Alur、Dill，A Theory of Timed Automata](https://doi.org/10.1016/0304-3975(94)90010-8)
- initialized、o-minimal 且相关集合/流可定义的 hybrid systems 存在有限双模拟；[Lafferriere、Pappas、Sastry，O-Minimal Hybrid Systems 技术报告](https://digicoll.lib.berkeley.edu/record/135809/files/ERL-98-29.pdf)
- 带扰动的非线性控制系统通常只能在增量稳定等前提下构造 alternating approximate bisimulation，而不是无误差精确商。[Pola、Tabuada，Symbolic Models for Nonlinear Control Systems](https://doi.org/10.1137/070698580)

**Warmachine 落地推论：** 本项目不能把固定网格、若干距离比例或随机路径代表称作 `Q_rule`。精确有限化必须依赖当前规则确实只观察有限个半代数事件谓词，并证明这些谓词对后继商类转移稳定；证明做不到的部分只能进入区间/过近似和 `unresolved`。

### 1.2 条件化版本可行，但“有限”可能是有限符号对象而非小列表

固定以下合同后，可以追求有限或有限符号化策略商：

```text
B = {
  Host/规则/数据/地图/军表/先后手收据，
  有限回合或有限激活时域，
  终局公式集合，
  完整多维目标及单调方向，
  双方信息结构、记忆和随机化类别，
  可观察历史字段
}
```

多目标 MDP 的精确 Pareto 曲线即使在有限模型中也可能有超多项式顶点，允许随机化时还可能出现无限多个 Pareto 点；双人随机博弈中的多目标策略还可能需要随机化和记忆。[Etessami 等，Multi-Objective Model Checking of MDPs](https://qav.cs.ox.ac.uk/papers/tacas07.pdf) [Chen 等，Synthesis for Multi-Objective Stochastic Games](https://qav.cs.ox.ac.uk/papers/qest2013.pdf)

因此可行的精确表示可能是：

- 有限状态/动作商；
- 每个商状态上的有理概率分布；
- 向下闭合结果集、凸多面体或 Pareto 面；
- 半代数几何单元及其邻接；
- BDD/MTBDD、约束 DAG 或区间上下界。

它不保证最终对象很小，也不保证多项式时间。

### 1.3 推荐结论

最有文献支撑、又符合 Warmachine 规则结构的方案是：

```text
局部精确几何/路径行为商
  -> 完整规则交替随机商 Q_rule
  -> 目标公式反向过近似包络
  -> 目标兼容概率交替双模拟/支配 Q_goal(B)
  -> 可采纳上下界剪枝
  -> strict 正向具体化 + 独立补集挑战
  -> CEGAR 拆分，直到精确、epsilon 终止或 unresolved 保留
```

反向搜索负责目标相关性，固定起点正向搜索负责历史可达性；两者都不能单独签发“全部有效策略已保留”。

## 2. 各技术的严格保证矩阵

| 技术 | 可减少的冗余 | 有前提的严格保证 | 不能保证 | Warmachine 合法用途 |
| --- | --- | --- | --- | --- |
| 离散反向可达/attractor | 与目标无关的状态 | 在完整有限转移图上，固定点精确给出可达/必胜集合 | 输入图动作不完整时不能补回遗漏；不自动给概率值 | 从全部刺杀/得分终局公式求候选前像 |
| HJ backward reachable set | 连续动力学的目标无关区域 | 在声明的 differential game、动态与 Isaacs 量词下，以 HJI 解刻画 backward reachable set | 不直接覆盖回合状态机、离散卡牌规则、多模型组合爆炸 | 仅作局部连续移动/追逃包络或可采纳距离界 |
| CAD/半代数 roadmap | 连续坐标的符号冗余 | 对半代数自由空间可精确回答连通性；sign-invariant cell 内指定多项式符号不变 | 连通等价不等于规则后继等价、伤害/概率等价或策略等价 | 构造局部移动终点 cell、碰撞自由路径类 |
| timed region/o-minimal quotient | 特定连续变量 | 在对应受限模型类别中得到有限、性质保持的商 | 不能外推到任意 Warmachine 连续状态 | 作为“有限化必须证明模型类别和观察闭包”的范式 |
| 对称约化 | 可互换实体、镜像/旋转状态 | 若群作用是模型 automorphism 且目标标签对称，orbit quotient 保持相应性质；概率模型可得 bisimilar quotient | 外观相同不等于可互换；非对称地图、武器、伤害、身份会破坏 | 同质同状态模型重标号、地图真实自同构、路线镜像 |
| 拓扑/同伦约化 | 同一自由空间中的连续路径族 | roadmap 保持连通分量；特定拓扑分类可保路径可达类别 | 不保触发先后、移动长度、路径中接触、终点规则和策略价值 | 先按连通/事件穿越序列分路径，再由 Host 细分 |
| alternating simulation | 双方选择下的有方向冗余 | 保持 coalition 能力的方向性关系，量词为我方/对手交替 | 普通 simulation 或双方各自单向 simulation 不足以安全合并 | 证明一个规则/策略状态被另一个状态支配 |
| probabilistic alternating simulation | 对手和 Chance 下的有方向冗余 | 通过分布 lifting 保持相应概率交替逻辑片段 | 只比较期望值、支持集或样本频率不够 | 支配剪枝及 Chance 耦合证书 |
| probabilistic alternating bisimulation | 真正可合并状态 | 同一对称关系内匹配双方选择、标签和概率质量，可签发等价商 | 两条“互相 simulation”证书一般不能代替一个双模拟关系 | `Q_rule`/`Q_goal` 的等价合并门 |
| CEGAR | 粗过近似中的伪行为 | 初始抽象 sound over-approximation 时，伪反例可引导拆分；细化保持不漏具体行为 | 欠近似漏掉的行为不会因内部反例检查自动出现；不保证快速终止 | Host reject 拆 cell；补集反例补规则谓词/目标义务 |
| POR | 独立动作的交错顺序 | 在相应 ample/persistent/stubborn 条件和性质类别下，保留可达/LTL/最优路径等指定性质 | 不保每条路径身份；依赖动作不能交换；性质变更可使旧 POR 失效 | 合并真正可交换的单位激活顺序 |
| 概率 POR | 独立概率活动的交错 | 在额外概率与 scheduler 条件下保持指定定量性质或 max/min 概率 | 非概率 POR 条件不能原样套用；不自动适用于双人交替博弈 | 仅对已证明 owner、Chance、scheduler 兼容的局部子图使用 |
| stubborn sets | 与目标无关且可交换的动作 | 强 stubborn sets 在确定性最优规划中可保持完备性/最优性；两人 reachability 有专门正确性条件 | 一个通用“动作低价值”规则不是 stubborn 证明；多目标随机博弈需重新提升 | 目标动作 landmark + dependency closure 的局部激活缩减 |
| BDD/MTBDD | 规则结构重复和集合表示 | 在底层有限模型正确时，符号固定点/数值算法与显式算法语义一致 | 只是表示技术；不证明动作域、几何或策略完整；变量顺序可能爆炸 | 离散状态集、转移关系、概率矩阵、上下界批量运算 |
| interval abstraction/IMDP | 未知或粗化概率、参数区域 | 对声明不确定集合给出 worst/best-case bounds；可做 robust synthesis | 把相关参数独立成区间可能非常松；区间策略不是每个具体模型的完整策略集 | 未细分 Chance/几何单元的守恒值区间 |
| parameter lifting | 参数连续区域 | 在多仿射、矩形、图保持等条件下，用 MDP/随机博弈给区域值上下界；分区可收紧 | 放松跨状态参数依赖会引入伪组合；未收紧前不能给精确值 | 攻防成功率参数、未定数据版本或几何概率界 |
| admissible branch-and-bound | 不能超过当前前沿的子空间 | 乐观上界确实不低估真实最优值时，可安全删除被已认证下界支配的区域 | 学习分数、rollout 平均值、LLM 评分不是 admissible bound | 多维理论最大伤害/得分/存活包络剪枝 |
| 抽象 lower/upper bounds | 粗抽象不确定性 | game-based abstraction 分离真实 nondeterminism 与抽象 nondeterminism，可包住原值并以 gap 驱动细化 | 界未闭合时不能取中点当真值；界只针对声明性质 | 每个初始状态输出胜率/得分/资源结果区间 |

## 3. 连续几何怎样形成有限规则行为商

### 3.1 几何对象必须是配置空间，不是距离采样

一个模型的平移位置可写为 `(x,y)`；若规则关心朝向，还要加入角度；一个多模型 Unit 的联合位置是所有成员配置的乘积。模型底盘、地形和其它模型将碰撞条件变成 configuration-space obstacle。Canny 的半代数 roadmap 对允许配置集合构造一维子集，并保证每个连通分量在 roadmap 中有对应连通结构，因此能精确回答半代数自由空间中的连通性。[Canny，Constructing Roadmaps of Semi-Algebraic Sets I](https://doi.org/10.1016/0004-3702(88)90055-0)

这提供的是**路径存在性**，不是完整规则等价。Warmachine 的路径还会影响：

- 穿越/接触地形和模型的先后；
- free strike、reaction、移动中触发和一次性窗口；
- rough terrain 等累计移动成本；
- Unit 各成员终点、连续性和附件范围；
- 结束位置的 LOS、射程、控制/命令范围、场景控制；
- 后续模型能否通过同一路线或占据同一空间。

因此“同一连通分量”最多是第一层拓扑商。

### 3.2 推荐的局部几何商键

对单次移动激活，构造有限谓词基 `P_H`：

```text
P_H = closure(
  当前 Host 合法性谓词，
  当前激活可能触发的 interaction-graph 谓词，
  剩余时域内目标/终局可能读取的几何谓词，
  后继动作枚举所读取的几何谓词
)
```

当底盘和地形由圆、多边形及有限代数阈值描述时，大量谓词可写成多项式等式/不等式，例如距离阈值、圆盘不相交、边界侧别和线段相交。CAD 的基本思想是把空间分成有限 sign-invariant cells，使给定有限多项式族在每个 cell 上符号恒定；Canny roadmap 则更直接保留半代数自由空间的连通性。[Prill，On Approximations and Incidence in CAD](https://doi.org/10.1137/0215069) [Canny，roadmap completeness](https://doi.org/10.1016/0004-3702(88)90055-0)

一个可审计的移动代表不应只有终点 cell，还应包含：

```text
movementClass = {
  endpointCellId,
  freeSpaceConnectedComponentId,
  orderedEventSurfaceWord,
  pathCostIntervalOrExactValue,
  touchedModel/Terrain identities,
  reactionWindowSignature,
  unitMemberPlacementCellIds,
  strictWitnessPath
}
```

只有同时证明以下条件，两个具体移动才可在 `Q_rule` 合并：

1. Host 接受/拒绝结果一致；
2. 支付、触发、窗口和事件次序一致；
3. 产生的终点状态落入相同后继规则商类；
4. 所有 Chance 分布一致；
5. 后续动作资格在商级一致。

### 3.3 为什么不能预先全局 CAD

若有 `n` 个可移动模型，联合连续维度至少约为 `2n`，再乘以路径、Unit 成员约束和回合历史。精确代数分解在维度上代价很高，Hybrid reachability 本身也不对一般模型可判定。[Henzinger 等](https://doi.org/10.1006/jcss.1998.1581)

因此本项目应使用**按激活局部构造 + 惰性组合**：

1. 固定当前完整离散状态和其它模型当前位置；
2. 只为当前 actor/Unit 构造局部自由空间和事件面；
3. 输出有限移动行为类及 strict witness；
4. 应用一个类后重新构造下一 actor 的局部商；
5. 用 transposition/对称/POR 合并不同历史得到的相同完整规则商状态。

这不会一次生成 `R^(2n)` 的全局分解，同时仍允许每条实际边由 Host 认证。

### 3.4 精确模式与 epsilon 模式必须分开

若所有规则结果只读取有限阈值关系，局部 exact cell 是合理目标。若策略目标还读取连续 margin，例如“离威胁越远越好”而不做阈值化，则同一规则 cell 中可能有连续多个价值；此时只能：

- 把相关等值面继续加入谓词基；
- 用区间上下界保存 cell 内价值；
- 或明确声明 epsilon 近似。

近似双模拟文献允许把输出误差写入模型关系，但它保留的是声明误差内性质，不是零误差全部策略。[Pola、Tabuada](https://doi.org/10.1137/070698580)

## 4. 反向可达与 backward reachable set

### 4.1 反向根必须是终局集合，不是一个完整终点

刺杀终局应是公式，例如：

```text
enemyLeaderRemoved
and ownLeaderAlive
and terminalTimingLegal
```

得分终局应包含合法计分窗口、先开始计分方、阈值、领先差、killbox/特殊场景条件及并列规则。根不应任意固定所有无关模型的坐标、血量和资源。

在有限离散 reachability game 上，反向 attractor 是 controllable predecessor 的固定点。布尔必达版本的量词取决于节点 owner：

```text
CPre(X) =
  Max state:    exists legal action whose required successors satisfy X
  Min state:    every legal opponent action satisfies X
  Chance state: every positive-mass outcome satisfies X      // almost-sure
```

若求最大胜率，必须递推：

```text
V_h(s) = terminalValue(s)
V_t(s) = max_a min_b sum_o P(o | s,a,b) * V_(t+1)(T(s,a,b,o))
```

不能把对手动作和骰子结果一起写成 `exists`。PRISM-games 的模型和策略综合正是把每个状态的玩家选择与其后的概率分布分开，并针对随机多玩家博弈计算保证性质。[Kwiatkowska 等，PRISM-games](https://pmc.ncbi.nlm.nih.gov/articles/PMC6560934/)

### 4.2 HJ reachability 能提供什么

Mitchell、Bayen 与 Tomlin 把连续 dynamic game 的 backward reachable set 表示为 HJI 方程 viscosity solution 的零子水平集，并显式保留控制方和扰动/对手方的量词。[Mitchell、Bayen、Tomlin，A Time-Dependent Hamilton-Jacobi Formulation](https://people.eecs.berkeley.edu/~tomlin/papers/MBT05.pdf)

它对本项目有两种价值：

1. 理论上说明“从目标集合向后求哪些连续状态可强制到达目标”是严谨对象；
2. 可在低维局部子问题中计算可采纳可达包络，例如一个模型在移动预算和障碍下能否进入某射程/控制区域。

但完整 Warmachine 不是一个低维光滑 differential game：它有数十模型、离散激活、卡牌规则、伤害状态机、触发窗口和骰子。HJ 方法的网格复杂度随连续维度指数增长；其综述明确把维数灾难列为主要挑战。[Bansal 等，Hamilton-Jacobi Reachability Overview](https://arxiv.org/abs/1709.07523)

**落地边界：** HJ/几何 backward set 可以产生局部必要条件或乐观上界，不应替代 Host transition，也不应承担全对局策略完整性。

### 4.3 反向搜索本身不是删除证书

反向生成器可以有两种语义：

- **欠近似 witness generator**：找到一些能到目标的候选；
- **过近似 necessary envelope**：包含所有仍可能有效的策略。

只有第二种能参与完整性。任何未被反向生成的 `Q_rule` 单元，如果没有不可达、等价、交替支配或可采纳上界证书，都必须进入 `unresolved` 和正向补集挑战队列。

## 5. 交替模拟、概率提升与真正可合并的状态

### 5.1 双方选择要求交替量词

Alur、Henzinger、Kupferman 与 Vardi 的 alternating refinement 用交替量词刻画 coalition 与环境的能力：我方动作需要存在匹配，而随后环境可能的选择必须被覆盖。[Alur 等，Alternating Refinement Relations](https://www.cs.huji.ac.il/~ornak/publications/concur98.pdf)

设 `p <= q` 表示 `q` 对我方至少不劣于 `p`。目标兼容 simulation 候选必须至少满足：

```text
Max node:
  for every action a in p
    exists action a' in q
      successorDistribution(p,a) lifted-to successorDistribution(q,a')

Min node:
  for every opponent action b' in q
    exists opponent action b in p
      successorDistribution(p,b) lifted-to successorDistribution(q,b')
```

Min 节点量词方向反过来，是为了防止 `q` 暗藏一个 `p` 没有的更坏对手回应。

### 5.2 Chance 必须比较完整分布

Probabilistic alternating simulation 把状态关系提升到分布，并处理 mixed actions 与对手量词；Zhang 与 Pang 给出了相应算法和 PATL 片段保持结果。[Zhang、Pang，Probabilistic Alternating Simulation](https://arxiv.org/abs/1106.1978)

两条路线即使期望伤害相同，只要以下任一项不同，就不能只凭期望合并：

- 命中/未命中概率；
- Tough、连续攻击、触发、偏差和 collateral outcome；
- 不同伤害状态导致的后继能力；
- 对手在各 outcome 后的合法回应。

分布 lifting 可实现为质量耦合：每单位概率质量只能沿候选 simulation relation 配对，且总质量精确守恒。当前项目使用有理骰子概率时可用整数流/有理流证书，避免浮点误差签发错误等价。

### 5.3 支配和合并必须分开

- **单向 alternating simulation** 可支持有方向支配：保留 `q`，删除 `p`，并保存 witness mapping。
- **合并为一个 quotient state** 必须使用同一个对称 probabilistic alternating bisimulation relation，匹配标签、owner、全部动作与分布。

Zhang 与 Pang 直接把对称的 probabilistic alternating simulation 定义为 probabilistic alternating bisimulation，并在同一关系内要求标签、双方策略量词与 lifted successor distributions 匹配。[Zhang、Pang，On Probabilistic Alternating Simulations](https://satoss.uni.lu/members/jun/papers/TCS10.pdf)

“分别找到 `p <= q` 和 `q <= p` 的两个最大 simulation”一般不能直接当作一个双模拟证明；合并门必须在同一对称固定点关系内检查。[Alur 等](https://www.cs.huji.ac.il/~ornak/publications/concur98.pdf)

### 5.4 这仍不等于保留全部目标策略

MDP state abstraction 文献区分保模型、保所有策略值、保最优 Q、保最优动作和只保共同最优 policy 等不同强度；较弱抽象不能推出所有策略或所有未来目标都被保留。[Li、Walsh、Littman，Towards a Unified Theory of State Abstraction for MDPs](https://thomasjwalsh.net/pub/aima06Towards.pdf)

因此 `Q_rule` 的概率双模拟负责规则行为；`Q_goal(B)` 还必须绑定目标向量、时域、历史/观察和策略类别。目标合同变化后，旧支配结论必须失效或重新证明。

## 6. 对称约化与拓扑约化

### 6.1 对称约化的严格条件

若群 `G` 对状态空间的作用保持：

- 转移关系和 action ownership；
- 原子标签、资源、伤害、能力和历史；
- Chance 概率；
- 当前目标公式；

则 orbit quotient 可保相应性质。PRISM 的概率对称约化论文对 DTMC、CTMC 和 MDP 构造 bisimilar quotient，并说明高度对称组件可获得很大压缩。[Kwiatkowska、Norman、Parker，Symmetry Reduction for Probabilistic Model Checking](https://www.prismmodelchecker.org/papers/cav06.pdf)

Warmachine 中可安全尝试：

- 同一 Unit 内数据、伤害、状态、武器和历史完全相同的模型重标号；
- 地图、部署、先后手和目标都保持的真实镜像/旋转；
- 多个完全相同、未被身份规则区分的 token/模型。

下列情况会破坏对称：attachment/leader 身份、不同武器/配装、不同伤害、被某规则点名、已触发/未触发状态、与独特地形关系不同、目标公式读取具体身份。视觉相似或距离直方图相同不是 automorphism 证书。

### 6.2 拓扑约化只保它声明的拓扑性质

Canny roadmap 的严格保证是自由空间连通分量的表示；它不保所有路径的动作语义。[Canny](https://doi.org/10.1016/0004-3702(88)90055-0)

Warmachine 可以先按以下粗类别压缩：

```text
free-space component
+ obstacle homotopy/topology class
+ ordered rule-event crossing word
```

但只要 rough cost、触发时机、经过敌人近战范围、最终剩余移动、Unit 成员次序或后续 LOS 不同，就必须继续拆分。拓扑相同是候选合并条件，不是最终规则等价。

## 7. Partial-order reduction、概率 POR 与 stubborn sets

### 7.1 POR 删除的是冗余交错，不是低分动作

POR 的基础是动作独立性：若 `a`、`b` 在相关状态中互不禁用，且 `ab` 与 `ba` 到达同一可观察后继，则只需保留一种交错来检查指定性质。它保留的是某类路径/性质，不是每条原始历史身份。

两人 reachability game 需要专门的 stubborn-set 条件。Bønneland 等证明其 reduction 在一般 labelled transition system 的两人可达博弈中保持胜者，并能从 reduced game 合成策略。[Bønneland 等，Stubborn Set Reduction for Two-Player Reachability Games](https://lmcs.episciences.org/7278/)

确定性最优规划中，strong stubborn sets 通过 dependency closure、必要 enabling set 和目标 action landmark，可在其 SAS+ 假设下保持完备性和最优性。[Alkhazraji 等，A Stubborn Set Algorithm for Optimal Planning](https://www.robert-mattmueller.de/wp-content/uploads/2016/04/alkhazraji-etal-ecai2012.pdf)

**不能外推：** “当前动作看起来不帮助终局”“ranker 分低”“LLM 没选”都不是 stubborn-set 条件。

### 7.2 Warmachine 的独立性证书必须很保守

两个激活只有在以下读写/几何影响全部不冲突时才可交换：

```text
write(a) disjoint read/write(b)
write(b) disjoint read/write(a)
and collision/LOS/path/scenario relations commute
and trigger/reaction/once-per-turn windows commute
and resource/soul/corpse/focus/fury effects commute
and action ownership/turn timing is unchanged
and terminal observation between a,b is irrelevant or preserved
```

常见破坏因素包括：一个模型移动后为另一个让路或挡路；先杀模型改变 corpse/soul/trigger；buff/debuff 顺序；场景控制在中间结算；Unit 连续性；free strike/reaction；先耗掉 once-per-turn；先移除屏障改变 LOS。因此实际可 POR 的激活可能比直觉少，但每个成功证书都能安全消除阶乘级排列。

### 7.3 概率 POR 不能复用非概率条件

Baier、Groesser 与 Ciesinski 针对 MDP 的 probabilistic LTL model checking 给出 ample-set 变体；D'Argenio 与 Niebert 明确展示，非概率线性时序 POR 条件不能直接保证概率 reachability，而其自身方法也只对声明性质提供相应保证。[Baier 等，Partial Order Reduction for Probabilistic Systems](https://iccl.inf.tu-dresden.de/web/Inproceedings3251558530/en) [D'Argenio、Niebert，Partial Order Reduction on Concurrent Probabilistic Programs](https://doi.org/10.1109/QEST.2004.1348038)

概率 POR 必须固定 scheduler/information 语义，并证明：

- Chance outcome 质量不因交错删除而改变；
- max/min scheduler 可在 reduced model 中得到对应代表；
- 不把玩家选择伪装为随机选择；
- 中间可观察状态和目标性质符合所用 POR 的 stutter/next 限制。

更关键的是，MDP 只有一个 nondeterministic scheduler；Warmachine 是双方交替博弈。除非使用已证明适用于两人随机博弈的提升，项目应把 POR 限于 owner 固定、概率局部且已证明 commuting 的子图，随后仍在完整 alternating game 上验证商关系。

### 7.4 POR 保胜者不等于保留全部有效策略

一个 reduction 可以保留“某方是否有必胜策略”或“最优值”，同时删除另一条结果相同但战术解释不同的路线。若报告需要展示全部 Pareto 战术类别，则 POR 还需保存：

- 被折叠的激活排列类；
- canonical representative；
- commutation witness；
- 每个目标维度和中间观察的保持证明。

否则它只能用于求值，不能声称保留全部可解释策略身份。

## 8. BDD/MTBDD 与符号模型检查

### 8.1 符号表示压缩集合，不创造正确抽象

McMillan 的 symbolic model checking 用 BDD 表示状态集合和转移关系，以布尔固定点批量计算 pre/post image。[McMillan，Symbolic Model Checking 博士论文作者页](https://mcmil.net/thesis.html)

概率模型中，PRISM 用 BDD 表结构、MTBDD 表概率矩阵/向量；其 hybrid approach 也说明纯 MTBDD 数值运算可能慢或中间向量膨胀，混合稀疏/符号实现往往更实用。[Kwiatkowska、Norman、Parker，Probabilistic Symbolic Model Checking with PRISM](https://www.prismmodelchecker.org/papers/tacas02.pdf)

PRISM-games 后续工作已经把 BDD/MTBDD 用于 turn-based stochastic game 的模型构建、value iteration 和策略综合。[Kwiatkowska 等，Symbolic Verification and Strategy Synthesis for Turn-based Stochastic Games](https://arxiv.org/abs/2211.06141)

**Warmachine 落地：**

- BDD：离散 facts、owner、turn/activation layer、规则标签、终局集合、几何 cell ID 的位编码；
- MTBDD：有理 Chance、值上下界、奖励向量的某些标量投影；
- 约束 DAG/SMT/半代数对象：连续 cell 与路径条件；
- 显式边：strict Host receipt、具体 witness、反例和 replay。

BDD/MTBDD 是否小高度依赖变量顺序和结构规律。它们不能证明谓词集合完整、连续域已有限化或未生成动作不存在。

### 8.2 推荐混合存储

```text
symbolic discrete relation     BDD
exact probability relation    rational edge table or MTBDD
geometry predicate cells      canonical constraint DAG
Pareto sets                   explicit nondominated vectors / polyhedra
strict evidence               content-addressed receipts
unresolved intervals          lower/upper bound objects
```

不建议把完整浮点坐标直接离散成 BDD bit-vector 后宣称 exact；bit precision 只是另一种网格，其边界误差必须进入抽象语义。

## 9. 参数/区间抽象

### 9.1 区间模型提供的是守恒界

Interval MDP 把每条转移概率表示为区间，并在不确定性对手下求 robust strategy。多目标 IMDP 工作可近似 robust Pareto set，但问题复杂且结果绑定给定 interval uncertainty semantics。[Hahn 等，Multi-Objective Robust Strategy Synthesis for IMDPs](https://arxiv.org/abs/1706.06875)

适合 Warmachine 的用途：

- 尚未细分的几何 cell 对命中/触发概率只知上下界；
- 规则数据版本或参数区域尚未固定；
- 低概率分支暂未具体展开，但概率质量必须保留；
- 抽象状态内不同具体状态给出不同动作/概率。

输出应为 `[lower, upper]`，而不是区间中点。

### 9.2 参数 lifting 的保证与依赖丢失

Parameter lifting 对多仿射参数和矩形区域，把跨状态参数依赖放松为局部 nondeterministic choices，从而用 MDP/随机博弈求上下界；区域细分可收紧。[Quatmann 等，Parameter Synthesis for Markov Models 技术报告](https://cs.ru.nl/personal/nilsjansen/files/publications/quatmann-et-al-tr-pl.pdf)

这类放松可能组合出任何单一真实参数赋值都不可能同时实现的极端选择，因此：

- 得到的 upper bound 可用于乐观剪枝的前置比较；
- lower bound 必须确认其策略可在同一一致参数赋值下具体实现；
- 参数依赖未恢复时，不能把 bounds 相等以外的结果当 exact；
- 规则参数与几何参数如果相关，不能独立分 interval 后遗忘相关约束。

### 9.3 game-based abstraction bounds 更适合处理状态聚合误差

Kattenbelt、Kwiatkowska、Norman 与 Parker 用两人 stochastic game 区分原 MDP 的 nondeterminism 与抽象引入的 nondeterminism，从而计算 reachability/reward 的 lower 和 upper bounds，并以 gap 驱动 refinement。[A Game-Based Abstraction-Refinement Framework for MDPs](https://www.cs.ox.ac.uk/techreports/oucl/RR-08-06.html)

概率 timed automata 的后续工作说明，符号 forward reachability 可构造同时给出 lower/upper reachability probability 的 stochastic-game abstraction，细化会提高精度。[Kwiatkowska、Norman、Parker，Stochastic Games for Verification of PTAs](https://www.prismmodelchecker.org/bibitem.php?key=KNP09c)

Warmachine 可直接借鉴“额外抽象玩家”：

```text
Player Max      我方真实选择
Player Min      对手真实选择
Chance          骰子/随机规则
Abstraction     某 cell 内尚未区分的具体状态/动作
```

Abstraction player 的 best/worst choices形成上下界；它不是第三个真实玩家，也不能进入战术解释。

## 10. 可采纳上界与 branch-and-bound

### 10.1 安全剪枝的逻辑

经典 A* 的 admissibility 要求 heuristic 不高估剩余最小成本；相反，在最大化问题中，未展开区域的 `U(C)` 必须不低估其可能最优结果。[Hart、Nilsson、Raphael，A Formal Basis for Heuristic Determination](https://ai.stanford.edu/~nilsson/OnlinePubs-Nils/PublishedPapers/astar.pdf)

Optimistic planning 同样维护 policy class 的 lower/upper bounds，优先展开最大 upper bound 的 class；其有限预算结果是近优界，不是未经条件的精确最优。[Buşoniu、Munos，Optimistic Planning for MDPs](https://proceedings.mlr.press/v22/busoniu12.html)

对多目标 Warmachine，候选类 `C` 只有在以下条件成立时可硬剪：

```text
for every optimistic outcome u in U(C):
  exists strict-certified guarantee l in LowerParetoFrontier:
    l >= u componentwise
```

若 `U(C)` 只是一个向量而真实可达结果是区域，必须证明该向量逐维覆盖区域；否则使用整块 optimistic region。

### 10.2 可用的规则上界

可组合但必须证明 admissible 的上界包括：

- 本回合理论最大移动/射程包络，忽略阻挡只会更乐观；
- 所有尚未展开骰子质量都按对该维最有利 outcome 计；
- 所有可用资源均按最有效合法转化计，但不能超越硬资源上限；
- 对手未展开回应在求我方 upper bound 时可暂时忽略，但求 lower bound 时必须全部闭合；
- 尚未具体分配的模型按最大可能得分/伤害/控制贡献计；
- 已死亡或规则明确不可用的能力不能进入乐观包络。

不能作为 hard-prune 上界：LLM/skill/ranker 分数、历史胜率、有限 rollout 平均值、经验阵型评分、当前最好路线的局部外推。

### 10.3 上界可能太松，但不能为了速度变成不安全

如果 bound 很松，只会少剪枝；若 bound 偏低，会永久删除真实优解。正确优化顺序是：

1. 保持 bound 可采纳；
2. 用规则交互图、资源守恒和几何事件 cell 收紧；
3. 仍然太松时细分候选类；
4. 预算结束仍未关闭则保留 `unresolved`。

## 11. CEGAR、反例和完整性债务

### 11.1 CEGAR 的基本保证

CEGAR 从 concrete behavior 的 sound upper approximation 开始；抽象反例若不能具体化，则根据伪前缀拆分抽象。[Clarke 等，Counterexample-Guided Abstraction Refinement](https://web.stanford.edu/class/cs357/cegar.pdf)

它不能修复初始欠近似：若真实路线从未进入抽象，检查抽象内部所有路线也不会发现它。

### 11.2 Warmachine 需要两类反例

**A. 包络内部伪路线**

```text
abstract reverse route
  -> strict forward materialization
  -> Host reject / wrong Chance / wrong opponent closure
  -> extract distinguishing predicate
  -> split geometry/rule/strategy cell
```

**B. 包络外遗漏路线**

```text
Q_rule complement with optimistic upper bound
  -> independent strict forward challenge
  -> finds feasible outcome not represented or better than frontier
  -> invalidate omission certificate
  -> extend reverse obligation language / partition
```

只有 A 没有 B，系统只能证明“生成的候选逐渐更真”，不能证明“没生成的都无效”。

### 11.3 三值而非二值

博弈抽象常需要 may/must/unknown 区分抽象不确定性；three-valued game abstraction 的目的正是避免把抽象未知错误当成双方确定能力。[de Alfaro、Godefroid、Jagadeesan，Three-Valued Abstractions of Games](https://luca.dealfaro.com/papers/04/lics04.pdf)

本项目每个 `Q_rule` cell 必须唯一进入：

```text
retained
equivalent_merged
dominance_pruned
upper_bound_pruned
proven_unreachable
unresolved
```

`reverse_not_generated`、`budget_exhausted`、`ranker_low` 都只能映射到 `unresolved`，不能映射到不可达或被支配。

## 12. 可落到 Warmachine 的完整技术方案

### 12.1 第 0 层：固定查询合同和失效键

每次搜索先生成 `StrategyQuotientReceipt`：

```json
{
  "hostSourceHash": "...",
  "rulesetHash": "...",
  "cardDataHash": "...",
  "mapScenarioHash": "...",
  "rosterDeploymentHash": "...",
  "horizon": "round/activation bound",
  "terminalFormulaHash": "...",
  "objectiveBasisHash": "...",
  "informationMemoryPolicyHash": "...",
  "geometryPredicateClosureHash": "..."
}
```

任一字段变化使 `Q_rule` 或 `Q_goal` 的相关证书失效。规则更新不能只重跑最终 search；必须从 interaction graph 影响闭包定位受影响谓词、cell、动作类和证明。

### 12.2 第 1 层：规则谓词与 interaction closure

从 Host 执行器和规则 interaction graph 生成有限 observation basis：

- 动作合法性；
- 路径碰撞、地形、LOS、射程、控制/命令、连续性；
- 生命周期三阶段、触发、reaction、resource、damage state；
- 场景得分与终局；
- 后续动作生成器实际读取的所有字段。

门禁不是“关键词出现过”，而是每个 predicate 有：source rule、Host reader/writer、event hook、predecessor operator、strict fixture 和 invalidation dependency。

### 12.3 第 2 层：按激活构造局部 `Q_geom`

1. 固定当前完整离散状态；
2. 对当前 actor/Unit 建 configuration-space obstacles；
3. 生成所有 rule-event surfaces；
4. 用 exact predicates/roadmap 或守恒 interval cells 划分 endpoint/path classes；
5. 每类至少保存一个 strict witness；
6. 验证类内 Host observation 和 successor class 稳定；
7. 不稳定类拆分，无法证明者标记 abstract/unresolved。

不能只检查终点合法；整条 base sweep、碰撞、路径事件和成员激活顺序必须参与。

### 12.4 第 3 层：构造完整 `Q_rule`

状态签名至少包含：

```text
turn/phase/active player/activation history
all alive/removed/destroyed states
damage and disabled systems
focus/fury/corpse/soul/continuous effects
once-per-turn and trigger windows
model/unit identities and Q_geom cells
scenario history and score windows
observable information/memory fields
```

动作域来自 Host 的完整动作族枚举和 `Q_geom`，不是 LLM/skill/ranker。每条边保留：legal receipt、支付、触发序列、Chance distribution、successor quotient key。

`Q_rule` 完成需要：

- 每状态合法动作/对手回应分母守恒；
- Chance 非零 outcome 和质量守恒；
- 每个几何 cell transition-stable；
- 每个 symmetry/POR merge 有证书；
- unresolved rule cell 为零，或整个上层声明降级。

### 12.5 第 4 层：反向目标过近似

从所有终局公式族并集开始，逐时域执行 typed predecessor：

- Max predecessor：全部可能有用的我方动作类；
- Min predecessor：保留最坏对手回应闭包；
- Chance predecessor：完整概率质量；
- geometry predecessor：反解目标 relation cell，而不是猜一个坐标；
- history predecessor：显式恢复资源、损伤、触发和场景历史的可能区间/集合。

反向必要条件只能由规则或可采纳上界证明。Skill、LLM、常用阵型和经验 combo 只做排序。

### 12.6 第 5 层：构造 `Q_goal(B)`

在相同剩余时域、owner、观察历史和目标合同内：

1. 计算最大概率交替 simulation 固定点；
2. 仅在同一对称 relation 上计算 probabilistic alternating bisimulation merge；
3. 用完整 Pareto guarantee set 判定支配；
4. 对每个删除项保存动作映射、对手量词、Chance coupling 和目标 witness；
5. 目标维度变化使该层重建。

### 12.7 第 6 层：上下界和 CEGAR

对每个保留/未决 cell 维护：

```text
strict feasible lower guarantee
admissible optimistic upper region
resolved/unresolved Chance mass
open opponent responses
abstract-player uncertainty
```

调度顺序：

1. 优先展开可能击穿当前 Pareto lower frontier 的最高 upper-bound cell；
2. strict 具体化反向路线；
3. 并行/分批挑战反向补集；
4. 用 Host 差异生成 refinement predicate；
5. bounds 被完全支配才 hard prune；
6. gap 未闭合则持续显示 `unresolved`。

### 12.8 第 7 层：只在证明后启用 symmetry/POR

建议优先级：

1. 身份重标号的 exact symmetry；
2. exact transposition；
3. 同一激活内路线拓扑 + event-word 合并；
4. 有 dependency proof 的 activation-order POR；
5. stochastic/game POR 只在专门 verifier 通过后启用。

任何 reduction 关闭时，baseline 语义不变；开启时必须能生成 reduction receipt，并能在小场景与完整展开逐状态/逐值对照。

## 13. “保留全部有效策略”的条件化命题

下面是本项目应证明、而非文献已经替项目证明的命题：

固定合同 `B` 和有限时域 `H`。若：

1. `Q_rule` 是具体规则系统的有限、label/owner/history/Chance-preserving probabilistic alternating bisimulation quotient；
2. 连续动作已按所有 Host 可观察事件与后继关系形成完整且 transition-stable 的有限/有限符号 cell；
3. 终局公式覆盖所有声明胜利类别；
4. 反向包络是所有潜在 Pareto 非支配策略的过近似；
5. 等价合并使用同一概率交替双模拟关系；
6. 单向删除只使用目标兼容交替支配、完整不可达或 admissible upper bound；
7. POR/symmetry 对当前目标、owner、Chance 和历史有保持证明；
8. 每个 `Q_rule` cell 有唯一 disposition，`unresolved=0`；
9. 包络内伪路线和包络外遗漏都经过 strict CEGAR 关闭；
10. Pareto 结果表示对当前目标运算闭合且精确；

则每个具体 Pareto 非支配策略都有一个商内代表，其保证结果集合不差于该策略。

该命题只保留**目标结果类**，不保留每条坐标历史身份；也不保证商小、算法快、未来规则仍成立或未知目标仍被保留。

## 14. 失败条件与 fail-closed 规则

出现以下任一情况，不得声明 exact 完整：

### 14.1 连续域失败

- 谓词基不是 Host reader/interaction closure 的闭包；
- path class 只按终点或距离划分；
- cell 内出现不同触发、后继动作或 Chance；
- 使用浮点 tolerance 合并但没有误差语义；
- 多模型 Unit 的成员身份/连续性被对称错误折叠。

### 14.2 博弈量词失败

- 对手回应不全；
- 玩家选择被当作 Chance；
- Chance 低概率质量消失；
- 用双方合作 witness 当保证策略；
- 只比较平均值而非分布/保证集合。

### 14.3 reduction 失败

- symmetry 不保持地图、目标、身份或概率；
- POR 动作实际读写冲突或中间终局可观察；
- 使用 MDP POR 证明双人随机博弈；
- 两个单向 simulations 被误当 bisimulation；
- 用 ranker/LLM/经验分数 hard prune。

### 14.4 抽象与界失败

- 初始反向域是欠近似，却没有补集挑战；
- upper bound 可能低于真实最优；
- lower bound 来自未 strict 具体化路线；
- interval/parameter dependencies 被放松后仍报告 exact；
- CEGAR 只消除包络内伪路线，不检查包络外遗漏；
- 预算结束把 unknown 改成 unreachable。

对应 fail-closed 输出：

```text
ruleQuotientComplete = false
effectiveStrategyQuotientComplete = false
value = [certifiedLower, admissibleUpper]
unresolvedDispositionCount > 0
```

## 15. 可验证实验方案

学术方案不能只靠论述。建议按以下 micro -> meso -> fixed matchup 三阶段验证。

### 15.1 Micro：可完整穷举的真值场景

1. **连续移动 cell**：一个移动者、圆/矩形障碍、rough terrain、一个阻挡模型；用 exact geometry 枚举全部 event cells，与密集采样只作反例发现对照。
2. **路径拓扑反例**：同终点两条路线，一条穿 reaction/rough event，一条不穿；证明只按终点会误合并。
3. **概率分布反例**：两动作期望相同但 Tough/触发分布不同；证明期望合并失败。
4. **对手量词反例**：一个状态多出对手有害回应；证明普通 simulation/双向单向 simulation 不能错误 merge。
5. **对称正反例**：同质模型重标号应合并；attachment/不同伤害模型不得合并。
6. **POR 正反例**：两个完全独立激活只保一个排列；加入挡路、corpse 或 once-per-turn 后必须恢复两种顺序。
7. **CEGAR 漏解**：故意从反向语言删一个 provider，补集 strict 搜索必须发现并触发 refinement。

每个 micro 场景都要有完整显式展开作为 oracle，比较：终局集合、max/min 值、Chance 质量、Pareto 结果和 representative mapping。

### 15.2 Meso：一个 Unit、一个整轮和真实规则交互

- 多模型 Unit advance/run/charge，成员路径、结束放置和连续性；
- buff/debuff、击杀三阶段、Tough、corpse/soul、reaction；
- 我方整轮激活顺序与对手一轮回应；
- 刺杀与得分终局并存；
- exact quotient 与关闭 reductions 的 baseline 对照。

关键指标：

```text
concrete proposals / Q_geom classes
Q_rule states / Q_goal states
symmetry reduction ratio
POR interleaving reduction ratio
abstract lower-upper gap
CEGAR refinement count
unresolved count and Chance mass
strict Host calls per certified class
```

### 15.3 Fixed matchup：Cryx/Fane 题

只有 micro/meso 完整对照通过后，才在固定 Cryx 六队 swarm 对 Fane 的任务上启用 reductions。大场景不能穷举时，输出只能是：

- 已认证策略 classes；
- 每初始状态/部署 cell 的 lower-upper value region；
- hard-pruned classes 及证书；
- unresolved complement 和剩余 upper bound；
- 当前最强反例挑战结果。

在 `unresolved > 0` 时，报告可以比较已知策略、收敛 gap 和证据强度，不能写“全局最优军表/部署/路线已证明”。

### 15.4 需要证伪的核心假设

实验不只测速度，还要主动尝试推翻：

- `H1`：局部 rule-event geometry cells 足以达到 Host transition stability；
- `H2`：目标反向包络比无引导正向显著缩小高 upper-bound 区域；
- `H3`：独立正向补集挑战能找回故意遗漏的有效策略；
- `H4`：symmetry/POR 在真实 Warmachine 中仍有可观 reduction，而不是大多被规则依赖破坏；
- `H5`：game-based interval bounds 经有限 refinement 能在目标时间内收紧；
- `H6`：策略 quotient 的节省大于证书、Pareto 与 CEGAR 开销。

若 H4/H5/H6 失败，架构仍可保持语义正确，只是降级为较少 reduction、更宽区间和更多 unresolved；不能通过放松证明门来制造性能。

## 16. 对商业/成熟工具方案的学术侧解释

本报告不使用产品营销材料，但成熟模型检验器论文显示了可复用的工程组合：

- PRISM：BDD/MTBDD + 显式稀疏数值混合；[PRISM hybrid paper](https://www.prismmodelchecker.org/papers/tacas02.pdf)
- PRISM-games：有限随机博弈的验证、策略综合和多目标分析；[PRISM-games overview](https://pmc.ncbi.nlm.nih.gov/articles/PMC6560934/)
- PRISM 的 game-based abstraction：上下界 + refinement；[Oxford RR-08-06](https://www.cs.ox.ac.uk/techreports/oucl/RR-08-06.html)
- 参数 lifting：参数区域上下界 + 区域拆分；[Quatmann 等](https://cs.ru.nl/personal/nilsjansen/files/publications/quatmann-et-al-tr-pl.pdf)

共同模式不是“一个强 ranker 猜中答案”，而是：有限模型合同、性质专用 reduction、守恒上下界、反例精化和明确的 unknown。它们也都假设输入模型已经正确；没有工具会替项目自动证明 Warmachine Host 的动作枚举、规则 interaction closure 和连续几何完整。

## 17. 最终建议

### 可以采用并开发

1. 用半代数/事件面和 roadmap 建局部连续几何行为类；
2. 用概率交替双模拟定义 `Q_rule` exact merge；
3. 用目标公式反向构造潜在有效策略过近似；
4. 用交替 simulation、Pareto guarantee 和 admissible bounds 做有证书剪枝；
5. 用 symmetry 与 POR 删除真实等价身份/交错；
6. 用 BDD/MTBDD/约束 DAG 压缩表示；
7. 用 game-based interval bounds 和双向 CEGAR 管理未决空间；
8. 用 independent forward complement challenge 防止反向欠近似漏解。

### 不能采用为完整性依据

- 固定网格、固定移动比例或有限随机采样；
- 只按终点、距离、阵型图像或拓扑连通合并；
- 只找到一条 strict 刺杀/得分路线；
- 只保一个最优标量动作或一个求解器 incumbent；
- 普通 simulation、期望值相同或双方分别单向 simulation；
- 非概率/单方 POR 直接套双人随机博弈；
- LLM、skill、ranker、历史胜率或 rollout 均值 hard prune；
- 包络内部 replay 全通过就宣布补集为空；
- epsilon/interval 结果改名为 exact。

### 对当前项目最准确的声明

> 在固定 Host、规则、数据、地图、军表、时域、目标和信息合同内，先建立完整的局部连续几何规则商，再以概率交替双模拟、性质保持的 symmetry/POR、目标反向过近似、可采纳上下界和双向 CEGAR 构造目标策略商。只有每个规则商单元都有有效 disposition、Chance/对手闭合、补集无未决且全部 merge/prune 有证书时，才可声明保留了该合同下全部有效结果类。

## 18. 一手来源索引

1. [Henzinger、Kopke、Puri、Varaiya：What's Decidable about Hybrid Automata?](https://doi.org/10.1006/jcss.1998.1581)
2. [Alur、Dill：A Theory of Timed Automata](https://doi.org/10.1016/0304-3975(94)90010-8)
3. [Lafferriere、Pappas、Sastry：O-Minimal Hybrid Systems](https://digicoll.lib.berkeley.edu/record/135809/files/ERL-98-29.pdf)
4. [Pola、Tabuada：Symbolic Models for Nonlinear Control Systems](https://doi.org/10.1137/070698580)
5. [Canny：Constructing Roadmaps of Semi-Algebraic Sets I](https://doi.org/10.1016/0004-3702(88)90055-0)
6. [Prill：On Approximations and Incidence in CAD](https://doi.org/10.1137/0215069)
7. [Mitchell、Bayen、Tomlin：A Time-Dependent Hamilton-Jacobi Formulation](https://people.eecs.berkeley.edu/~tomlin/papers/MBT05.pdf)
8. [Bansal 等：Hamilton-Jacobi Reachability Overview](https://arxiv.org/abs/1709.07523)
9. [Alur 等：Alternating Refinement Relations](https://www.cs.huji.ac.il/~ornak/publications/concur98.pdf)
10. [Zhang、Pang：On Probabilistic Alternating Simulations](https://satoss.uni.lu/members/jun/papers/TCS10.pdf)
11. [Zhang、Pang：Probabilistic Alternating Simulation Algorithm](https://arxiv.org/abs/1106.1978)
12. [de Alfaro、Godefroid、Jagadeesan：Three-Valued Abstractions of Games](https://luca.dealfaro.com/papers/04/lics04.pdf)
13. [Li、Walsh、Littman：State Abstraction for MDPs](https://thomasjwalsh.net/pub/aima06Towards.pdf)
14. [Etessami 等：Multi-Objective Model Checking of MDPs](https://qav.cs.ox.ac.uk/papers/tacas07.pdf)
15. [Chen 等：Synthesis for Multi-Objective Stochastic Games](https://qav.cs.ox.ac.uk/papers/qest2013.pdf)
16. [Kwiatkowska、Norman、Parker：Probabilistic Symmetry Reduction](https://www.prismmodelchecker.org/papers/cav06.pdf)
17. [Bønneland 等：Stubborn Set Reduction for Two-Player Reachability Games](https://lmcs.episciences.org/7278/)
18. [Alkhazraji 等：Stubborn Sets for Optimal Planning](https://www.robert-mattmueller.de/wp-content/uploads/2016/04/alkhazraji-etal-ecai2012.pdf)
19. [Baier 等：POR for Probabilistic Systems](https://iccl.inf.tu-dresden.de/web/Inproceedings3251558530/en)
20. [D'Argenio、Niebert：POR on Concurrent Probabilistic Programs](https://doi.org/10.1109/QEST.2004.1348038)
21. [McMillan：Symbolic Model Checking](https://mcmil.net/thesis.html)
22. [Kwiatkowska、Norman、Parker：PRISM Hybrid Symbolic Model Checking](https://www.prismmodelchecker.org/papers/tacas02.pdf)
23. [Kwiatkowska 等：Symbolic Strategy Synthesis for Turn-Based Stochastic Games](https://arxiv.org/abs/2211.06141)
24. [Hahn 等：Multi-Objective Robust Strategy Synthesis for IMDPs](https://arxiv.org/abs/1706.06875)
25. [Quatmann 等：Parameter Synthesis for Markov Models](https://cs.ru.nl/personal/nilsjansen/files/publications/quatmann-et-al-tr-pl.pdf)
26. [Kattenbelt 等：Game-Based Abstraction-Refinement for MDPs](https://www.cs.ox.ac.uk/techreports/oucl/RR-08-06.html)
27. [Kwiatkowska、Norman、Parker：Stochastic Games for Verification of PTAs](https://www.prismmodelchecker.org/bibitem.php?key=KNP09c)
28. [Clarke 等：Counterexample-Guided Abstraction Refinement](https://web.stanford.edu/class/cs357/cegar.pdf)
29. [Hart、Nilsson、Raphael：A Formal Basis for Heuristic Determination](https://ai.stanford.edu/~nilsson/OnlinePubs-Nils/PublishedPapers/astar.pdf)
30. [Buşoniu、Munos：Optimistic Planning for MDPs](https://proceedings.mlr.press/v22/busoniu12.html)
31. [Kwiatkowska 等：PRISM-games](https://pmc.ncbi.nlm.nih.gov/articles/PMC6560934/)
