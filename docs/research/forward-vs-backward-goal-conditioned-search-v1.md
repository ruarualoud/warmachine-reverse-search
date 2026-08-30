# 固定起点正向搜索与目标约束反向搜索调研 V1

## 研究问题

对 Warmachine 这类同时包含连续几何、离散规则、随机结果和双方选择的系统，比较：

1. 从一个固定、完整、合法的起点状态正向搜索，直到进入目标场景；
2. 从目标约束反复求前像，寻找可以到达该目标的前驱集合；
3. 由两端共同限制搜索，并用 strict 正向执行连接、认证候选。

这里的“限制搜索空间”不能只看最先找到一条路线所需的节点数。至少要分别衡量：

- 找到一条存在性路线的成本；
- 覆盖完整玩家选择、对手回应和 Chance 结果的成本；
- 连续动作域被有限表示后的覆盖债务；
- strict 规则执行调用、无效前像、唯一状态、内存和恢复成本；
- 最终结论是一个 witness、一个值区间，还是闭合证明。

## 结论摘要

不存在“正向永远更小”或“反向永远更小”的一般结论。两种方向限制的是不同自由度：

- **固定起点正向搜索最强地限制历史可达性。** 每个节点都是从真实起点经合法动作生成的完整状态，因此不会产生无法从该起点到达的符号前驱；但它在靠近开局时必须面对大量与当前胜利目标无关的合法激活、目标、资源顺序和连续几何参数。
- **目标公式反向前像最强地限制目标相关性。** 它只展开可能支持终局公式的动作、能力、资源和几何关系，特别适合稀疏、选择性强的刺杀或得分条件；但随着时间向前推远，部分状态会变宽、非可逆动作会产生大量候选前驱，并可能出现不能从固定起点到达的伪前像。
- **从一个完整终局状态点反向不是本项目需要的反向搜索。** 一个具体终局点固定了大量与胜利无关的模型位置、血量和临时字段，也要求连续坐标精确相等，会错误排除满足同一胜利公式的其它终局。正确根是目标集合或公式，以及对该集合有证明的有限几何单元。
- **对本项目，最佳默认不是纯正向或纯反向，而是目标条件驱动的双向混合。** 先用反向目标约束生成必要条件、动作族和连续参数单元，再从固定合法起点用 Host strict 正向执行构造真实路线；必要时让两端在“完整正向状态与反向约束单元相交”的接口相遇。
- **反向只在终局附近通常更有收缩力。** 一旦反向前像的符号宽度、伪前像率或连续域债务开始快速增长，就应停止盲目继续反推，改由受反向约束引导的 strict 正向连接器补齐历史。
- **存在性路径与对抗/Chance 闭包必须分开。** 一条 strict 路线只证明某组双方选择和某组骰子结果可以到达目标；它不证明我方能在所有对手回应下取胜，也不提供胜率。后者需要我方选择、对手最坏回应和完整 Chance 质量的动态规划或固定点闭包。

因此，本项目的方向策略应概括为：

> 反向搜索负责回答“为了这个结果，哪些条件和动作可能相关”；正向 strict 搜索负责回答“从这个真实开局，哪条具体历史确实可执行”；对抗/Chance 值层负责回答“这条策略面对所有回应和随机结果有多可靠”。

## 四类一手来源收口

本报告的方向结论只依赖以下四类核心证据，文献调研到此封口。运动规划、cell decomposition、CEGAR 和概率模型检查只用于解释连续域与闭包实现，不再扩大方向判断的来源分母。

| 类别 | 一手来源 | 被本项目采用的结论 | 不能外推的结论 |
| --- | --- | --- | --- |
| progression / regression | [Fikes、Nilsson，STRIPS](https://ai.stanford.edu/~nilsson/OnlinePubs-Nils/PublishedPapers/strips.pdf)；[Alcázar 等，Revisiting Regression in Planning](https://www.ijcai.org/Proceedings/13/Papers/333.pdf) | progression 从完整起点构造真实前缀；regression 从部分目标生成前驱条件并聚焦相关动作 | regression 不保证比 progression 小，也不自动排除从固定起点不可达的伪前像 |
| symbolic forward / backward | [Burch 等，Symbolic Model Checking](https://mcmil.net/pubs/IC92.pdf) | 用关系、量词和固定点整体表示状态集合；forward image 与 backward preimage 可共享同一符号转移关系 | BDD 或符号表示不保证消除状态爆炸，也不自动把连续规则状态变成有限系统 |
| HJ backward reachable set | [Mitchell、Bayen、Tomlin，A Time-Dependent Hamilton-Jacobi Formulation](https://people.eecs.berkeley.edu/~tomlin/papers/journals/mbt05_tac.pdf) | 目标集合的 backward reachable set 与对抗量词天然匹配“哪些状态能到达/被迫到达目标”的查询 | 全局网格 HJ 不能直接扩展到包含大量模型、离散规则和历史状态的完整 Warmachine 对局 |
| bidirectional asymmetry | [Sturtevant 等，Predicting the Effectiveness of Bidirectional Heuristic Search](https://ojs.aaai.org/index.php/ICAPS/article/view/6672)；[Kuroiwa、Fukunaga，Front-to-Front Heuristic Search](https://www.ijcai.org/proceedings/2020/567) | 图与启发式的不对称性、关键状态和真实前沿会合决定双向搜索是否获益 | 不能从理想对称树的中点分析推导 Warmachine 双向搜索必然更快 |

这四类证据共同支持的最小结论是：先用目标公式产生反向约束，再从固定合法起点正向 strict 构造；是否继续反向、转为正向连接或启用双向会合，必须由同分母实验决定。

## 一、必须先区分的四个对象

设：

- `x` 是完整规则状态，包括双方模型、位置、资源、伤害、持续效果、回合、激活和场景历史；
- `I = {x0}` 是一个固定合法起点；
- `G_phi = {x | phi(x)}` 是满足胜利公式 `phi` 的目标状态集合；
- `T(x, a, b, omega)` 是 Host 执行我方选择 `a`、对手选择 `b` 和随机结果 `omega` 后的严格转移。

### 1. 完整状态点

一个完整状态点给每个状态变量赋值。固定开局属于这种对象。它非常适合 strict 正向执行和精确去重。

### 2. 目标集合或目标公式

刺杀、得分胜利和固定回合状态都是状态集合，不是唯一状态。例如“敌方 Leader 已移除且我方 Leader 存活”没有规定所有普通模型的精确坐标。经典规划中的目标通常也是部分状态；Alcázar 等明确指出，初始状态完整而目标是部分赋值，所以回归搜索实际在状态集合上工作，而非从一个普通完整终点逐点倒走。[Alcázar 等，Revisiting Regression in Planning](https://www.ijcai.org/Proceedings/13/Papers/333.pdf)

### 3. 存在性前像

普通存在性前像为：

```text
Pre_exists(G) = { x | exists a, b, omega: T(x, a, b, omega) in G }
```

它适合发现一条合作式或幸运骰路线。若把对手动作和 Chance outcome 也放进存在量词，它不能回答策略是否可靠。

### 4. 对抗与 Chance 前像

有限时域的值递推应更接近：

```text
V_H(x) = 1[x in G]
V_t(x) = max_a min_b sum_omega P(omega | x, a, b)
                              * V_(t+1)(T(x, a, b, omega))
```

这里：

- `max` 是我方可控选择；
- `min` 是对手的最坏合法回应；
- `sum` 只用于真实随机事件并要求概率质量守恒；
- 玩家选择的坐标、路线和阵型不是随机变量，不能按面积或采样频率写入 Chance 账。

PRISM 的原始工具论文把概率转移与非确定性明确分开，并要求离散时间随机转移的出边概率总和为 `1`；它也说明 MDP 同时包含概率与非确定行为，概率时序逻辑可以对所有调度计算概率界。[Kwiatkowska、Norman、Parker，PRISM](https://www.cs.ox.ac.uk/people/david.parker/papers/tools02.pdf)

## 二、经典规划中的 progression 与 regression

### 正向 progression

正向搜索从完整初始状态开始，只应用当前满足前提的动作。它的优点是：

- 每个生成状态都具有一条真实前缀；
- 动作可用性和状态更新可以直接交给 Host；
- 去重基于完整状态，语义清楚；
- 不需要为不可逆规则编写完整逆算子。

缺点是目标信息可能很弱。只要动作在规则上合法，它就可能进入前沿，即使与刺杀、得分或目标场景毫无关系。Warmachine 的激活顺序、移动终点、攻击目标、资源花费和可选能力会在靠近开局时共同放大这个问题。

### 反向 regression

STRIPS 的原始设计使用动作前提和效果支持目标导向规划，是目标回归的经典来源。[Fikes、Nilsson，STRIPS](https://ai.stanford.edu/~nilsson/OnlinePubs-Nils/PublishedPapers/strips.pdf) 对目标公式 `g` 和一个可能支持它的动作 `a`，回归不是“倒放物理状态”，而是构造使执行 `a` 后满足 `g` 的前置条件集合。

这使回归天然只考虑与当前未满足目标相关的动作。在 Warmachine 中，刺杀前像可以先收缩为：能够造成所需伤害或移除效果的攻击者、需要的 LOS/射程、资源、目标状态和时序窗口，而不必先枚举开局中所有无关模型的任意移动。

但回归的节点是部分状态集合。Alcázar 等指出其主要困难包括：

- 重复检测比完整状态更复杂；
- 可生成从初始状态不可达的伪状态；
- 许多为正向完整状态设计的启发式不能直接复用；
- 实验中回归和正向的优劣随领域变化，回归并未整体支配正向。[Alcázar 等，Revisiting Regression in Planning](https://www.ijcai.org/Proceedings/13/Papers/333.pdf)

这与 Warmachine 高度吻合。伤害、移除、复活、持续效果、Focus/Fury、单位编队和历史得分都可能有多种前史。只回归终局局部条件会产生许多彼此一致、但无法同时嵌入同一合法开局历史的组合。

### 对本项目的判断

如果问题是“终局前一到数个动作有哪些可能支持者”，目标回归通常比固定起点无引导正向搜索更聚焦。如果问题是“这些前驱能否一直追溯到这个精确开局”，正向完整状态对真实可达性的限制更强。

所以不能比较两个裸节点数后下结论。应分别记录：

- 反向目标收缩了多少动作族和参数域；
- 其中多少物化前驱被 strict 正向执行判为伪前像；
- 正向前沿中有多少合法分支不满足任何当前反向必要条件。

## 三、双向启发式搜索的条件与边界

普通图上，双向搜索只有在两个前沿能有效“在中间相遇”时才有优势。MM 算法证明了一类双向启发式搜索可以保证不越过解路径中点，但论文同时强调不同问题条件会分别有利于 MM、A* 或暴力搜索。[Holte 等，MM](https://ojs.aaai.org/index.php/AAAI/article/view/10436)

经典规划更困难，因为：

- 正向前沿是完整状态；
- 反向前沿是满足目标的状态集合或部分赋值；
- 动作通常不可直接逆转；
- 两个前沿可能在语义上兼容，却没有完全相同的状态键。

Kuroiwa 与 Fukunaga 的 front-to-front 工作指出，以前一些双向规划器只是正向和反向搜索的组合，并没有真正相遇；他们的 TTBS 通过直接估计两个前沿之间的距离，在部分领域解决了任一单向搜索都未解决的实例，但该结果仍是领域相关的实验结论。[Kuroiwa、Fukunaga，Front-to-Front Heuristic Search](https://www.ijcai.org/proceedings/2020/567)

Sturtevant 等进一步把双向搜索效果与关键状态以及底层图、启发式的方向不对称联系起来，并用实验说明这些因素会改变单向或双向搜索的相对表现。[Sturtevant 等，Predicting the Effectiveness of Bidirectional Heuristic Search](https://ojs.aaai.org/index.php/ICAPS/article/view/6672) Warmachine 的正向端是完整状态，反向端是约束集合；正向合法动作与反向 provider 数量也不对称，因此不能套用对称、可逆、单目标图的分支因子估计。

本项目不能把“状态哈希相等”作为唯一会合条件。更合适的接口是：

```text
完整正向状态 x  满足  反向约束单元 C
```

会合后还必须由 Host strict 重放整个前缀和后缀。一个约束相交或几何近似命中只能产生 connector candidate，不能签发路线证明。

## 四、Hamilton-Jacobi 的 forward/backward reachability

可达集理论把方向区别表达得很清楚：

- forward reachable set 从初始集合传播，描述在给定时域内能到达的状态；
- backward reachable set 从目标集合传播，描述哪些状态可以在给定时域内进入目标；
- 在动态博弈中，控制与扰动的量词顺序决定它是合作式可达、鲁棒可达还是不可避免集合。

Kurzhanski 与 Varaiya 用 forward HJB 方程描述从初始集合出发的 reach set，用 backward HJB 方程描述能到达给定目标的 solvability set。[Kurzhanski、Varaiya，Dynamic Optimization for Reachability Problems](https://doi.org/10.1023/A:1026497115405)

Mitchell、Bayen 与 Tomlin 则证明了连续动态博弈的 backward reachable set 可由 Hamilton-Jacobi-Isaacs 方程的粘性解表示；其模型显式包含一方控制和另一方最坏输入，并使用非预见策略定义双方信息结构。[Mitchell、Bayen、Tomlin，A Time-Dependent Hamilton-Jacobi Formulation](https://people.eecs.berkeley.edu/~tomlin/papers/journals/mbt05_tac.pdf)

这给本项目两个直接启示：

1. 如果查询本身是“哪些状态能在若干回合内进入某胜利集合”，backward reachable set 比从一个起点计算整个 forward reachable set 更贴近查询。
2. 对手闭包不是在找到反向路线后附加一句“考虑最坏情况”，而是前像算子的量词本身就必须区分我方选择与对手选择。

但 HJ 网格方法的内存和计算随连续状态维数指数增长，原论文也明确说明该限制。Warmachine 完整状态同时含有大量模型坐标、离散生命状态、资源和规则标记，不能把整局直接放入一个全局 HJ 网格。HJ 更适合本项目中的低维局部子问题，例如单模型相对位置、追击/脱离边界或一个小型交战簇的保守可达包络。

## 五、运动规划中的目标偏置与双向树

RRT-Connect 从起点和终点配置各生长一棵随机树，并用贪心连接启发式让两棵树相向扩展。其原论文把问题定义为连续配置空间中的单次查询，并报告这种双向结构用于高维无碰撞路径规划。[Kuffner、LaValle，RRT-Connect](https://www.kuffner.org/james/papers/kuffner_icra2000.pdf)

目标偏置 RRT 会以某个概率直接选择目标，而非一般随机样本。LaValle 的原始实现文档明确把它定义为一次偏置硬币选择；其书中同时警告偏置过强会变得过于贪心，偏置过弱则不足以帮助连接目标。[LaValle，RRTGoalBias](https://lavalle.pl/msl/class_RRTGoalBias.html) [LaValle，Planning Algorithms](https://lavalle.pl/planning/book.pdf)

这些方法说明：即使不构造完整精确分解，目标也可以显著改善连续空间中的采样方向。但它们不能直接提供本项目需要的全域证明：

- 有限次随机采样没有找到路线，不等于路线不存在；
- 一条无碰撞几何路径不等于完整 Warmachine 激活合法；
- 普通 RRT 查询没有对手回合和 Chance 质量闭包；
- 一个终点配置不同于刺杀或得分目标公式所代表的大型状态集合。

更接近本项目的是 Garrett、Lozano-Pérez 与 Kaelbling 的 HBF。该方法面对连续与离散混合、每状态存在无限动作参数的规划问题，先从目标约束反向识别有用动作和低维约束，再用这些约束引导从完整初始状态开始的正向搜索。论文特别指出，无引导随机采样可能无法命中低维甚至测度为零的关键动作子空间，并给出其混合算法的概率完备性条件。[Garrett、Lozano-Pérez、Kaelbling，Backward-Forward Search for Manipulation Planning](https://lis.csail.mit.edu/pubs/garrett-iros15.pdf)

HBF 是本项目最直接的学术类比，但仍不能原样移植：Warmachine 还需要对手量词、真实骰子概率、回合状态机和 Host strict 收据。可移植的是架构思想：**反向约束用于提议和缩域，完整状态正向执行用于构造路线。**

## 六、symbolic model checking 与前像固定点

符号模型检查不逐个列出状态，而用逻辑关系或 BDD 表示状态集合和转移关系，并通过像、前像和最小/最大固定点计算可达性。Burch 等的原始工作展示了用 BDD 表示关系和公式，并用 Mu-calculus 固定点统一表达可达集合；论文也明确指出 BDD 并非在所有问题上都能避免状态爆炸，其效果依赖状态图规律和变量编码。[Burch 等，Symbolic Model Checking](https://mcmil.net/pubs/IC92.pdf)

对同一个符号转移关系 `R(x, x')`，两个方向应明确写成：

```text
Post_R(S)(x') = exists x:  S(x) and R(x, x')
Pre_R(G)(x)   = exists x': R(x, x') and G(x')
```

forward fixed point 从 `I` 反复并入 `Post`，backward fixed point 从 `G` 反复并入 `Pre`。两者可以共享关系分区和集合表示，但方向代价取决于中间集合的表示大小；“符号化”本身不决定哪个方向更小。若需要对手鲁棒闭包，普通存在前像还必须替换成区分双方量词的 controllable predecessor；若有 Chance，则需要概率值递推，不能继续使用布尔可达前像。

对 Warmachine，适合符号化的不是把全部浮点坐标塞进 BDD，而是：

- 终局公式与时间层；
- 动作族、目标身份和资源义务；
- LOS、射程、控制、连续性、场景控制等有限关系谓词；
- 玩家选择、对手选择和 Chance outcome 的节点类型；
- unresolved、strict rejected 和 proven excluded 的处置账。

连续几何仍需先建立有限、可证明的行为商空间，才能进入有限固定点。符号表示压缩的是规律，不会自动证明抽象保留了所有规则行为。

当粗抽象产生一条无法由 Host 具体执行的候选时，可采用反例引导精化。Clarke 等的 CEGAR 原始工作从较小抽象开始，检查反例是否真实，并用伪反例定位需要拆分的抽象状态；它也强调抽象模型可能包含具体系统不存在的行为。[Clarke 等，CEGAR](https://www.cs.cmu.edu/~emc/papers/Conference%20Papers/Counterexample-guided%20Abstraction%20Refinement.pdf)

本项目对应的循环应为：

1. 反向目标公式产生粗约束单元；
2. 正向 Host strict 尝试物化和连接；
3. strict reject 若只反驳一个代表点，则保留该单元并换代表或细分；
4. 若 reject 暴露遗漏的规则边界，则把该谓词加入单元签名；
5. 只有单元内所有 Host 可观察谓词恒定，才允许行为等价合并；
6. 无法证明的剩余部分保留为连续域 unresolved，不宣称不可达。

## 七、连续空间 cell decomposition 的作用

Lozano-Pérez 的 configuration-space 方法把物体的位置和朝向表示为配置空间中的一点，并把碰撞配置表示为配置空间障碍。这说明模型底盘不能只作为终点碰撞检查；底盘大小和障碍必须进入整个路径的配置空间约束。[Lozano-Pérez，Spatial Planning](https://lis.csail.mit.edu/pubs/tlp/spatial-planning.pdf)

精确 cell decomposition 把连续自由空间划分为有限单元，并保存单元邻接；若单元内路径易构造、邻接完整且起终点可定位，运动规划可归约为图搜索。[LaValle，Vertical Cell Decomposition](https://lavalle.pl/planning/node262.html) LaValle 同时强调，精确组合方法的完备性依赖输入表示和问题类别；一般完整运动规划虽然存在理论算法，但可能不实用。[LaValle，Combinatorial Motion Planning](https://lavalle.pl/planning/ch6.pdf)

Warmachine 的有限单元边界不能只来自地形多边形，还必须包含所有规则可观察事件面：

- 桌边、部署区和场景区域边界；
- 按底盘半径膨胀后的地形、模型碰撞和路径扫掠边界；
- LOS 切换、遮挡切线、Stealth/True Sight 等规则关系变化；
- 近战、远程、法术、控制范围和命令范围阈值；
- 单位连续性、附件距离和逐模型终点约束；
- 移动中触发、反应窗口和路径拓扑类别；
- 影响伤害、目标资格、场景控制或后续动作可用性的其它 Host 谓词。

连续坐标由此变成有限行为等价单元，而不是固定步长网格。代表点只是一条 strict 执行见证；“单元内谓词不变”和“路径邻接完整”才是有限化证明。

多模型单位的配置空间维数会随模型数增长，不能直接做全局笛卡尔分解。项目应使用因子化约束图、逐模型增量放置、局部冲突传播和有证明的对称折叠。只要单位成员身份、武器、生命状态、触发或可选动作不同，就不能仅因几何相似而合并。

## 八、哪一种方向实际更能限制空间

### 情况 A：目标是一个稀疏公式，离终局很近

反向更有约束力。刺杀的最后攻击、得分的最后结算、特定触发链和资源支付都能从终局必要条件筛出较少的动作族与关系单元。此时从开局枚举所有单位的合法动作浪费明显。

### 情况 B：目标被错误指定为完整终局点

反向看似极窄，实际上错误。它会把噪声模型坐标、非关键血量和临时字段也当作必须精确还原的条件。应改成目标公式和有限终局单元，再比较方向。

### 情况 C：距离开局较远，规则高度不可逆

正向对“真实可达历史”的限制更强。反向的复活、移除、资源消耗、持续效果、回合结算和多模型位置可能产生很多符号前史；固定起点正向执行不会生成这些伪历史。

### 情况 D：连续动作中的关键可行集很薄

无引导正向采样可能很难命中。反向射程、LOS、底盘和终局关系约束可以先生成低维参数流形或事件单元，再让正向搜索在其中取样。HBF 对无限动作空间的处理为这种混合提供了直接研究依据。

### 情况 E：需要面对所有对手回应和完整骰子概率

搜索方向本身不解决闭包。无论正向还是反向，只展开一条双方合作路线都不够。必须使用 game predecessor 或值递推，分别闭合我方 OR、对手 AND/min 和 Chance 概率质量。

### 情况 F：需要证明连续域没有遗漏

纯采样正向和少量反向代表都不够。需要精确或保守的行为单元分解、覆盖账和 CEGAR 精化。不能完成有限商证明的部分必须保持 unresolved。

## 九、适合本项目的架构建议

### 1. 三层搜索职责

**目标回归层**

- 输入参数化终局公式，不输入一个任意完整终局点；
- 生成动作族、规则能力、资源、时序和几何必要条件；
- 对连续参数生成有证明的事件单元；
- 只做候选生成、必要条件排除和调度，不签发规则真值。

**strict 正向构造层**

- 从固定合法开局或已认证中间状态出发；
- 只执行 Host 枚举的合法动作；
- 使用反向约束排序、限制连续参数生成器和定义连接里程碑；
- 对完整前缀、后缀和会合处独立重放。

**对抗/Chance 值层**

- 我方合法选择用 OR/max；
- 对手合法回应用 AND/min；
- 骰子和真正随机事件用精确 Chance 质量；
- 未闭合动作单元、回应或概率质量进入值区间上界债务。

### 2. 动态选择方向，不写死层数

每个搜索层都测量正向与反向实际成本，再决定下一批扩展方向。反向继续扩展的信号包括：

- 目标约束仍能明显缩小动作族或参数单元；
- strict 物化的伪前像比例较低；
- 符号单元没有快速碎片化；
- 当前主要债务是缺少目标 provider，而不是历史连接。

切换到目标引导正向连接的信号包括：

- 大量反向候选不能从固定开局到达；
- 非可逆生命周期或跨回合资源导致前像宽化；
- 连续几何单元主要受开局现有模型位置限制；
- 反向约束已给出清楚里程碑，但中间动作组合仍未知。

是否启用真正双向 front-to-front，还应看约束单元与正向状态的 join precision。两个前沿经常擦肩而过时，双向维护成本可能不值得。

### 3. 不把几何选择伪造成概率

连续移动终点、路径和阵型是玩家决策域。有限 cell 的数量、面积、代表频率都不是自然胜率。报告只记录：

- 单元是否已证明等价；
- 是否有 strict witness；
- 是否被规则证明排除；
- 是否因预算或证明不足 unresolved。

Chance 账只保存真实随机事件的概率质量。

### 4. exact 声明边界

只有以下条件同时满足，才允许称一个有限时域值“闭合”：

- 起点、终局公式、时域和 Host receipt 固定；
- 全部相关动作族和参数单元覆盖；
- 连续几何单元具有谓词恒定与邻接完整证明；
- 所有我方选择、对手回应和反应窗口闭合；
- Chance outcome 互斥且概率总质量守恒；
- 每条保留路线可完整 strict 重放；
- 没有预算延迟或规则未知影响该值。

否则应输出值区间和分类债务，而不是“未找到所以不可达”。

## 十、项目实验设计

### 共同分母

四种模式必须绑定完全相同的：

- Host、数据、规则和 Steamroller receipt；
- 固定合法起点或相同起点集合；
- 参数化目标公式与终局几何单元；
- 回合/激活时域；
- 动作族、连续单元与 Chance denominator；
- CPU、内存、Host 调用和墙钟预算；
- strict accepted、strict rejected、proven excluded、unresolved 的处置定义。

### 可直接执行的现有基线

当前仓库已有两个不需要新增实现的最小入口：

```bash
npm run verify:direction
npm run verify:completion
```

- `verify:direction` 验证 `warmachine_search_direction_measurement_v1` 的同分母合同、方向调度和双向 join 指标。它使用固定校准样本，只验证度量与调度代码，不是新的真实对局结论。
- `verify:completion` 对三个 Pressure Point 微场景实际比较 `pure_reverse_atomic`、`unguided_strict_forward` 和 `reverse_milestone_forward_connector`，并更新 `docs/research/forward-completion-experiment-v2-verification.json`。它是当前可复现的真实 strict 基线，但没有完整 Chance 和对手闭包。

对抗与 Chance 值层可独立执行：

```bash
npm run verify:adversarial-chance-equivalence
npm run verify:initial-state-adversarial-value
```

这些命令验证 OR/max、AND/min、Chance 和值区间代数，不替代四种方向在同一真实场景上的性能比较。

### 四模式实验记录合同

后续 runner 必须让每个模式输出一条机器可比较记录。字段直接映射现有 `warmachine_search_direction_measurement_v1`，新增字段只用于补齐伪前像和闭包债务：

```json
{
  "denominator": {
    "queryKey": "...",
    "terminalFamily": "...",
    "horizonLayer": "...",
    "hostReceiptHash": "...",
    "searchContextKey": "...",
    "proposalUniverseHash": "...",
    "canonicalStateSchema": "warmachine_rules_v1_state"
  },
  "mode": "strict_forward | symbolic_backward | goal_guided_forward | front_to_front",
  "counts": {
    "expandedNodeCount": 0,
    "generatedCandidateCount": 0,
    "consistentCandidateCount": 0,
    "uniqueCandidateCount": 0,
    "unresolvedCandidateCount": 0,
    "materializedPreimageCount": 0,
    "strictRejectedPreimageCount": 0,
    "strictConnectionWitnessCount": 0,
    "strictTransitionCallCount": 0,
    "joinCheckCount": 0,
    "coarseJoinMatchCount": 0,
    "strictJoinMatchCount": 0,
    "constraintVariableCountBefore": 0,
    "constraintVariableCountAfter": 0
  },
  "closure": {
    "activationDomainComplete": false,
    "continuousGeometryComplete": false,
    "opponentResponseSetComplete": false,
    "chanceMassComplete": false,
    "resolvedChanceMass": "0/1",
    "unresolvedChanceMass": "1/1",
    "valueLower": 0,
    "valueUpper": 1
  },
  "resources": {
    "elapsedMs": 0,
    "peakBytes": 0,
    "persistentBytes": 0,
    "checkpointResumeMs": 0
  }
}
```

所有计数必须来自 runner 和 Host 收据，不允许事后从报告文字推测。相同场景四条记录的 `denominator` 必须逐字段相同，否则该组比较无效。

### 对照模式

| 模式 | 搜索方式 | 目的 |
| --- | --- | --- |
| `strict_forward` | 固定起点按稳定动作键正向展开 | 测量无目标缩域时的真实基线 |
| `symbolic_backward` | 从目标公式反复求符号前像 | 测量目标收缩和伪前像成本 |
| `goal_guided_forward` | 反向必要条件指导起点正向搜索 | 验证推荐默认架构 |
| `front_to_front` | 两端扩展并在完整状态/约束单元相交处连接 | 测量真实双向会合收益 |

四种模式都必须把预算未展开项记为 unresolved；只有 Host strict 正向执行能认证边。

### 场景矩阵

1. **单动作刺杀**：可有限穷举，用于检查反向是否完整找回所有攻击 provider。
2. **资源与动作顺序刺杀**：包含 Focus/Fury、施法、移动、初始攻击和额外攻击。
3. **薄几何可行集**：LOS、射程和底盘路径共同形成窄事件单元，比较无引导采样与反向约束采样。
4. **多模型 Unit 移动**：包含逐模型路径、单位连续性、附件和激活顺序。
5. **完整对手回合**：我方候选后展开对手所有合法重要回应，检查存在性 witness 与鲁棒值分离。
6. **Chance 分支**：命中、伤害、Tough 等 outcome 全量枚举，检查概率质量守恒和区间宽度。
7. **历史得分终局**：绑定每个计分窗口、Leader 位置、场景来源和提前终局。
8. **固定 Cryx/Fane 路线**：在真实规模上比较 witness 成本、恢复、外存和未闭合债务，不假装可穷举全局。

### 核心指标

**搜索规模**

- `expandedNodes`：实际展开节点数；
- `generatedCandidates`：生成候选总数；
- `uniqueFullStates`：规范完整状态数；
- `symbolicCells`：反向约束/几何单元数；
- `effectiveUniqueFanout = uniqueChildren / expandedParents`；
- `peakResidentBytes`、持久 DAG 字节、checkpoint 恢复时间。

**方向有效性**

- `strictCallsPerWitness`：每条新 strict witness 的 Host 调用；
- `spuriousPreimageRate = strictRejectedMaterializations / materializedPreimages`；
- `forwardGoalIrrelevanceRate`：正向子节点中不满足任何当前反向必要条件的比例；
- `joinPrecision = strictConnectedJoins / proposedJoins`；
- `constraintContractionRate = (constraintVariableCountBefore - constraintVariableCountAfter) / constraintVariableCountBefore`；
- 每层反向谓词数、自由变量数和单元碎片化变化；
- 首条 witness 时间与在同一声明分母下闭合所需时间分开报告。

若分母为 `0`，相应比率必须输出 `null`，不能伪造为 `0`。如果只找到 witness 但动作域、对手或 Chance 未闭合，结果字段必须保持 `valueLower=0`、`valueUpper=1` 或由已有闭合质量支持的保守区间；不能用 witness 数量估算胜率。

**完整性债务**

- 动作族、目标/profile、资源顺序、路径类和触发窗口覆盖；
- `resolved / rejected / provenExcluded / unresolved / budgetDeferred` 单元数；
- 对手回应覆盖率及未展开回应数；
- Chance `resolvedMass + unresolvedMass = 1` 的精确有理数账；
- 初始状态值区间宽度，而非代表频次“胜率”。

这些指标不预设阈值。先在可穷举微场景得到方向的真实分母，再用固定 Cryx/Fane 题校准调度阈值；阈值必须标记为实验校准值，而非理论常数。

### 通过判据

推荐混合架构只有在以下事实同时出现时才算获得支持：

- 与微场景穷举真值相比不漏 strict 路线；
- 相同预算下，`goal_guided_forward` 的 witness yield 或闭合进度优于至少一个单向基线；
- 反向未把伪前像、预算省略或代表采样误报为不可达；
- 正向 connector 没有绕过反向目标分母和 Chance/对手账；
- 在进程中断、恢复和 Host receipt 漂移后，语义结果保持或 fail closed；
- 若某场景中纯正向或纯反向更好，调度器能根据测量切换，而不是强迫所有领域使用同一方向。

## 十一、本仓库已有证据

仓库已有有限对照实验比较了纯反向、无引导 strict 正向和里程碑引导 strict 正向连接器：

- 直接刺杀和直接得分都由纯反向后缀直接取得 strict witness；
- “防守方先撤离再结束回合”的得分缺口中，无引导正向使用 `26` 次 strict 转移找到路线，里程碑连接器使用 `4` 次；
- 该实验只覆盖三个有限微场景，攻击使用指定成功骰，Chance 与对手回应没有闭合。

因此它支持“目标约束引导正向连接器值得保留”，但不证明一般速度优势。证据和声明边界见 [反向路线与正向补全对照实验 V2](../forward-completion-experiment-v2.md) 与 [验证记录](forward-completion-experiment-v2-verification.json)。

当前 Ticket 20 的连续几何与完整激活域应作为下一轮方向实验的前置条件。否则比较的只是几个脚本动作和离散距离代表，并非同一完整搜索分母。

## 最终建议

1. **不要从任意完整终局点纯反推。** 使用参数化胜利公式和有证明的终局几何单元。
2. **终局附近优先反向。** 用前像找动作 provider、资源/时序义务和低维几何关系。
3. **长历史优先由目标引导的 strict 正向搜索完成。** 反向条件只限制候选，不复制规则执行。
4. **保留真正的 front-to-front 实验。** 会合键必须是完整正向状态满足反向约束，并由 strict replay 认证。
5. **把对手与 Chance 放进算子语义。** 一条存在性路线不能进入初始状态值或胜率报告。
6. **连续空间使用行为等价 cell 与 CEGAR。** 固定距离比例、规则网格或随机代表只能是 witness 提议，不能成为完整性证明。
7. **按层动态选择方向。** 以伪前像率、无关正向分支、join precision、strict calls、内存和 unresolved 债务决定下一批扩展，不预设一刀切方向。

对问题“哪一种更能限制搜索空间”的最短回答是：

> 目标集合反向前像更能限制与胜利无关的自由度，固定起点正向搜索更能限制不真实的历史自由度。Warmachine 同时需要两种限制，因此应先反向求必要约束，再让固定起点 strict 正向搜索与其相交；在未闭合对手、Chance 和连续几何之前，只报告可达 witness 与值区间。
