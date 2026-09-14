# Warmachine 合理终局场景生成的数学重评估

**日期：** 2026-09-14

**问题：** 如何在离散规则、连续几何、双方选择和骰子并存的 Warmachine 中，系统生成合理的胜利终局场景，并从终局反推到初始状态，而不靠任意抽样、错误等价或主观剪枝。

**结论性质：** 数学与算法架构裁决，不是当前实现已经获得完整场景集或整局最优值的证明。

## 结论

这个问题不应表述成“随机生成很多看起来合理的棋盘”。更准确的数学问题是：

> 对一个有界的混合离散/连续随机对抗系统，给定合法初态集合 `I`、胜利目标集合 `G`、
> 时域 `H` 和双方信息结构，计算哪些终局区域可达、哪些可由一方强制达到、其概率或值区间
> 是多少，并保留从初态到这些区域的严格见证与未解析质量。

调研得到六个直接结论：

1. **原始完整空间不能直接穷举。** 多物体连续运动规划即使在二维矩形环境中也已是
   PSPACE-hard；一般混合系统的可达性甚至不可判定。完整性只能相对于明确受限的查询域、
   符号区域和误差界声明。
2. **终局必须是区域/公式，不是一个坐标点。** 连续分布下单个精确点通常概率为零；固定一个
   完整终局点还会把无关棋子位置、血量和历史噪声误当成必要条件。
3. **“合理”至少分四层。** `规则合法`、`从声明初态可达`、`与胜利因果相关`、
   `在指定策略/先验下有足够概率或在最坏对手下有足够值`是不同结论，不能由一个分数代替。
4. **没有先验或双方策略，就没有自然场景概率。** 骰子有规则概率；玩家动作只有在给定 policy
   后才有概率。对手若按最坏回应处理，应计算 `max-min` 值，而不是把对手动作当均匀随机。
5. **反向搜索适合生成目标相关候选，但不能独自证明价值。** 它应计算符号前驱和乐观可达区域；
   Strict 正向重放、对手/Chance 闭包和区间求值负责排除伪前驱并确认真实结果。
6. **当前单变量代表法只能做覆盖调度。** 现有代码明确使用基线加单维变化，
   `interactionStrength=1`；它会漏掉 Stealth、True Sight、云雾、地形、单位阻挡等高阶组合，
   不能证明合理场景或策略类完整。

因此，项目应采用以下主线：

```text
胜利公式
  -> 规则关联图裁出的因果变量闭包
  -> 混合约束求解得到终局符号区域
  -> 分层反向可达/价值区间
  -> Strict 正向见证与反例
  -> CEGAR 拆分不稳定区域
  -> Max / Min / Chance 求值
  -> 场景档案、策略报告和未决质量
```

## 一、数学对象

### 1. 查询域

每次可认证搜索先固定：

```text
Q = (R, C, M, B, S, H, I, G, O, P, epsilon, delta)
```

- `R`：规则、卡牌和 Host 收据；
- `C`：双方合法军表及逐副本配装域；
- `M/B/S`：地图、地形、部署和 Steamroller 场景；
- `H`：绝对回合/动作上限；
- `I`：合法初态集合或已观测当前状态；
- `G`：刺杀、得分、固定轮次等终局公式；
- `O`：双方可观察信息和动作所有权；
- `P`：骰子概率，以及可选的军表、部署、地图和 policy 先验；
- `epsilon/delta`：允许的值区间宽度和统计置信失败率。

没有 `H`，状态与历史可能无限；没有 `P`，不能解释“场景出现概率”；没有 `O`，对手策略的
量词会错误；没有当前 `R`，任何旧等价、路线和值都失效。

### 2. 四种不能混用的前驱

设 `X` 是下一层目标区域，`T(s,a,b,s')` 是规则转移和 Chance 分布。

**存在性前驱：** 至少有一组动作/结果能到达 `X`。

```text
Pre_possible(X) = { s | exists a, b, s' : T(s,a,b,s') > 0 and s' in X }
```

它只回答“可能发生”，适合提出刺杀或得分候选；对手可能主动配合。

**可强制前驱：** 我方存在动作，使对手任何合法回应都不能阻止进入 `X`。经典可达博弈用
controllable predecessor 的不动点计算胜区；符号博弈的 `Pre_G` 也要求系统能在环境任意行为下
强制下一状态进入目标集合。

**概率前驱：** 固定双方 policy 后，对目标指示函数做期望。

```text
V_t(s) = sum_s' T_pi(s,s') * V_(t+1)(s')
```

**对抗概率前驱：** 双人零和回合制场景应使用：

```text
V_t(s) = max_a min_b sum_s' T(s,a,b,s') * V_(t+1)(s')
```

其中动作所有权、同时选择和信息结构必须由 Host 给出。PRISM-games 已在有限随机多人博弈中实现
概率可达、多目标和策略合成；这支持求值层，但前提仍是我们先构造一个正确的有限模型。

来源：[PRISM-games](https://www.prismmodelchecker.org/games/)、
[随机博弈量化验证综述](https://www.sciencedirect.com/science/article/pii/S0947358016300292)、
[并发可达博弈](https://www.sciencedirect.com/science/article/pii/S030439750700504X)。

### 3. 终局点为何不对

棋子坐标属于连续空间。若位置先验有密度，任一精确坐标向量的概率通常为零。真正有意义的是：

- “攻击者底盘边缘距目标不超过射程”；
- “路径位于配置空间自由连通分量”；
- “LOS 被某种遮挡关系阻断或恢复”；
- “模型位于目标区且满足控制资格”；
- “资源、伤害和时序满足终局动作前提”。

这些都是带等式/不等式与离散标签的区域公式。精确坐标只是区域中的一个执行见证，不能代表
整个区域；一个见证成功只证明该区域非空。

## 二、哪些数学项目真正相关

### 1. 有限双模拟与混合系统可达性

Timed Automata 的 region graph 是有限双模拟；o-minimal hybrid systems 在相关集合、流和重置满足
可定义性及初始化条件时也存在有限双模拟。这说明连续空间在强结构条件下可以被有限化，并保留
可达性。

反面同样重要：一般混合系统可达性不可判定；多模型几何也会迅速达到高复杂度。Warmachine
虽然没有连续时间微分方程，但包含大量圆盘位置、路径、遮挡、顺序和离散触发，不能仅凭“规则
阈值有限”就推断商空间很小。

来源：[Timed Automata region graph 讲义](https://people.eecs.berkeley.edu/~sastry/ee291e/lygeros.pdf)、
[O-Minimal Hybrid Systems](https://www2.eecs.berkeley.edu/Pubs/TechRpts/1998/3442.html)、
[混合系统可达性综述](https://home.cs.colorado.edu/~srirams/papers/reachability-survey-2022.PDF)。

**对项目的含义：** 只有规则谓词、动作参数域和后继关系在每个单元上稳定时，该单元才是
`Q_rule` 候选；“取一个代表点通过”不足以签发双模拟。

### 2. 半代数单元、CAD 与运动规划 roadmap

圆形底盘碰撞、边界、距离、接触、射程和许多 LOS 条件可写成多项式等式/不等式。CAD 能把
实空间分为有限的符号不变单元；Canny roadmap 能在每个半代数自由空间连通分量中保留连通
骨架。Partial CAD 进一步只构造判定当前公式需要的部分。

但完整多物体运动规划即使二维也可能 PSPACE-hard；把所有棋子坐标一次性做全局 CAD 不可行。
应只对当前终局义务的因果闭包生成局部事件面，并把其它棋子作为区间障碍或未决依赖，按反例
逐步加入。

来源：[Canny roadmap 完备性](https://www.sciencedirect.com/science/article/pii/0004370288900550)、
[Partial CAD](https://www.sciencedirect.com/science/article/pii/S0747717108801526)、
[多物体运动规划 PSPACE-hard](https://journals.sagepub.com/doi/10.1177/027836498400300405)。

**对项目的含义：** `0.01"` 网格可以是声明精度下的有限近似，却不是原连续规则的自动完整
证明；规则临界面/连通分量比均匀网格更适合作为首层符号区域。

### 3. Hamilton-Jacobi、viability kernel 与有界实数判定

Hamilton-Jacobi reachability 直接从目标/危险集合反向计算 backward reachable set 或 tube，并可把
控制者与扰动者写成连续对抗博弈；viability kernel 则刻画在约束内仍存在控制策略的状态集合。
这与“从刺杀/得分区域反推哪些位置关系仍能达成目标”在数学上高度同构。

另一条路线是 `dReal/dReach`：把有界混合可达问题编码成实数一阶公式，给出 `unsat` 或
`delta-sat` 的 delta-complete 判定。它适合验证一个有界候选区域是否存在精确几何见证，或证明
某个局部约束盒在声明容差下不可满足。

来源：[Hamilton-Jacobi reachability 工具与方法](https://arxiv.org/abs/1709.07523)、
[随机混合系统的动态博弈可达框架](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2011/EECS-2011-101.html)、
[dReach/dReal bounded reachability](https://arxiv.org/abs/1404.7171)、
[Viability Kernel value algorithm](https://www.sciencedirect.com/science/article/pii/S0022247X96902735)。

**对项目的含义：** 这类算法应服务于“当前攻击者、目标、关键阻挡物和少量反应模型”的局部
终局几何证明。HJ 有维度灾难，实数判定也会随变量与非线性约束快速变贵；它们不能一次性求解
103 个模型的全桌多回合策略。局部结果应作为 `Q_rule` 单元的上下界/可满足性证书，再由全局
离散博弈组合。

### 4. 符号动态规划与决策图

SPUDD 用 ADD 表示因子化 MDP 的转移和值函数，在最多 6300 万状态的实验中显著减少表示节点；
一阶符号动态规划通过 decision-theoretic regression 生成按值和 policy 所需区别划分的状态公式，
避免先把全部状态命题化。

这不是“自动消除状态爆炸”：压缩依赖问题结构和决策图顺序，最坏复杂度仍在。但它给出一个
正确原则：先按规则因子和目标回归，只有当值或 policy 真正不同才继续拆分。

来源：[SPUDD](https://www.cs.toronto.edu/kr/publications/spudd.pdf)、
[Symbolic Dynamic Programming for First-Order MDPs](https://www.cs.toronto.edu/~cebly/Papers/dtregress.pdf)。

**对项目的含义：** 现有 interaction graph 应成为终局公式的变量消元/因果闭包图，而不仅是
审计索引。编译出的规则因子可用共享决策 DAG 表达，避免按所有卡牌字段做笛卡尔积。

### 5. 加权模型计数与混合模型积分

AllSMT 可枚举满足离散和算术约束的投影解；Algebraic Model Counting 用半环统一处理可达性、
计数、概率和代价；Weighted Model Integration 把它扩展到布尔变量与连续算术约束的混合域。
树状稀疏依赖图上，WMI 可利用上下文独立性显著加速。

来源：[Disjoint Projected AllSMT](https://www.sciencedirect.com/science/article/pii/S0004370225000238)、
[Algebraic Model Counting](https://www.sciencedirect.com/science/article/pii/S157086831630088X)、
[Weighted Model Integration](https://web.cs.ucla.edu/~guyvdb/papers/BelleIJCAI15.pdf)、
[利用稀疏图的 WMI](https://proceedings.mlr.press/v115/zeng20a.html)。

**对项目的含义：** 终局生成可以先求“满足规则与终局公式的符号格”，再选择见证；若声明了
军表、地图、位置和 policy 先验，可以对格做加权积分。没有权重时只能报告可满足区域或体积，
不能报告自然出现概率。

### 6. 稀有事件、条件路径与 committor

Transition Path Theory 研究 Markov 过程从集合 `A` 到集合 `B` 的反应路径；forward committor
就是从当前状态先到 `B` 而不是回到 `A` 的概率。Doob `h`-transform 可用 committor 构造条件于
到达目标的过程。Adaptive Multilevel Splitting 和 Cross-Entropy importance sampling 则通过
逐级偏置采样有效发现稀有终局，并保留概率校正；广义 AMS 已有无偏估计结果。

来源：[Transition Path Theory](https://doi.org/10.1007/s10955-005-9003-9)、
[有限时域 TPT](https://link.springer.com/article/10.1007/s00332-020-09652-7)、
[广义 AMS 无偏性](https://www.imstat.org/publications/aap/aap_26_6/AAP_26_6.pdf)、
[Cross-Entropy rare-event estimation](https://pubsonline.informs.org/doi/abs/10.1287/ijoc.1060.0176)。

**对项目的含义：** 这类方法很适合在固定 policy 对下生成“条件于刺杀/得分成功”的罕见路线，
但它们需要一个基础随机过程。双方没有固定 policy 时，committor 不是唯一的；必须分别报告
合作可达、固定 policy 概率和对抗 `max-min` 值。

### 7. 抽象精化与上下界

概率 CEGAR 把抽象引入的不确定性表示成额外对手，从抽象模型得到真实最小/最大可达概率的
上下界；若区间过宽，就用导致差异的策略或反例拆分抽象。UPPAAL Stratego 的成功案例也采用
“先符号合成安全策略，再在安全策略内部做统计优化”，而不是让学习器决定规则安全性。

来源：[概率程序抽象精化](https://www.prismmodelchecker.org/papers/vmcai09.pdf)、
[Game-based MDP abstraction](https://www.dcs.gla.ac.uk/~gethin/papers/qest06.pdf)、
[UPPAAL Stratego 安全与优化案例](https://uppaal.org/casestudies/stratego/)。

**对项目的含义：** 当前大单元应先有 `lower/upper`，不能把代表点的值复制给整格。只有区间
达到门槛或双模拟成立才停止拆分。

### 8. 覆盖数组和质量多样性只能调度

NIST 的 t-way covering arrays 能用较少样本覆盖配置交互；MAP-Elites/Quality Diversity 能在
行为描述格中保留多样且高质量的候选。它们适合安排验证和扩充场景档案，却不证明未采样组合
没有新策略。

来源：[NIST 组合测试](https://csrc.nist.gov/Projects/Automated-Combinatorial-Testing-for-Software)、
[Ordered t-way combinations](https://csrc.nist.gov/pubs/cswp/26/ordered-t-way-combinations-for-testing-state-based/final)、
[Quality Diversity 综述](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2016.00040/full)。

**对项目的含义：** 二元/三元规则组合覆盖能比当前单维代表更早发现问题，但仍只能进入
`scheduled_for_challenge`，不能进入 `equivalent` 或 `pruned`。

## 三、“合理终局场景”的可执行定义

不再使用单一布尔 `reasonable=true`。每个终局区域 `C` 保存以下独立证据：

| 层级 | 问题 | 可接受证据 |
| --- | --- | --- |
| `legal` | 是否满足规则静态不变量和终局公式 | SMT/几何约束 + Host 静态审计 |
| `witness_reachable` | 是否至少有一个合法初态/路径到达 | 独立 Strict 正向重放 |
| `enforceable` | 对手最坏回应下是否仍可到达 | 完整 Max/Min/Chance 子图或保守区间 |
| `policy_likelihood` | 在指定双方 policy 下多常见 | 完整概率 DP、WMI 或带校正的稀有事件估计 |
| `prior_mass` | 军表/地图/部署先验给该区域多少质量 | 明示先验与加权计数/积分 |
| `causal_relevance` | 哪些状态变量会影响终局或路线 | interaction graph 因果闭包及反例扩展 |
| `robustness` | 坐标/骰子/回应有多大容错 | 区域体积、概率下界、最坏扰动或值区间 |

给玩家展示时可以把这些维度汇总，但存储、剪枝和证明不能丢掉原始分量。

### 终局区域生成

1. 从 Steamroller 和规则器编译终局公式 `G_k`，而不是手写一组名字后默认完整。
2. 在 interaction graph 上从 `G_k` 反向取因果闭包：计分历史、Leader 生命周期、LOS、资源、
   伤害、触发、单位连续性、地形和相关模型。
3. 对离散变量构造投影 AllSMT/决策图，对连续变量构造局部半代数约束与配置空间连通单元。
4. 每个符号区域保存约束公式、边界包含关系、候选体积/权重和一个或多个具体见证。
5. 若同一区域内 Host 合法动作、回应、Chance 或终局值不稳定，按造成差异的规则谓词拆分。

这里生成的是“所有当前公式和预算下尚可能有效的区域”，不是先随机一个坐标再尝试解释。

### 反向多层展开

从 `G` 开始逐层计算：

```text
R_H = G
R_t = Pre(R_(t+1)) intersect LegalInvariant
```

每层同时保留：

- `possible`：至少一条支持路径；
- `force_lower/force_upper`：最坏对手下的值区间；
- `policy_probability`：只在双方 policy 已声明时存在；
- `strict_witnesses`：从已知合法初态到该区域的正向路线；
- `spurious_or_unresolved`：抽象伪前驱、预算和规则未知。

反推越远，义务通常越宽。出现以下情况时停止盲目反推，改用反向约束引导的 Strict 正向连接：

- 区域数或未决体积连续数层快速增长；
- 大量区域只有存在性上界，没有可执行见证；
- 非可逆生命周期、召唤/复活、Unit 联合摆位使前驱约束失去选择性；
- 正向可达集与反向可达集的交集已足够小。

## 四、概率剪枝的严格边界

### 1. 不能逐路径按 `0.01` 删除

若有 `200` 条互斥路线，每条概率 `0.005`，每条都低于 `0.01`，但总概率可以是 `1`。因此：

```text
单路径概率 < 阈值  !=  该区域总概率 < 阈值
```

只有先在相同状态、时层、目标、policy 游标和对手决策上下文中合并概率质量，得到整个未展开
区域的可采纳上界 `U(C)`，且 `U(C) < epsilon`，才能把它记为低概率质量。该质量仍应写入
`pruned_mass`，不能把剩余分支重新归一化。

### 2. 最可能路径不是胜率

Adaptive Stress Testing、Cross-Entropy 或 Viterbi 类算法可找一条最可能成功路线；目标可达概率
却是全部互斥成功路线质量的和。报告必须区分：

- `best_path_probability`；
- `total_target_probability`；
- `max_min_target_value`；
- `unresolved_probability_upper_bound`。

### 3. 没有分布时使用区间和测度标签

若部署/玩家策略没有可信数据，可并列提供：

- 均匀于声明符号格的实验先验；
- 用户输入的赛事/军表/地图先验；
- 固定 policy 对下的运行概率；
- 与先验无关的存在性和最坏对手保证。

这些结果不能互相冒充。特别是“生成了多少格”不是这些格在真实比赛中的概率。

## 五、策略等价与完整性

### 1. 三类身份必须分开

- **精确状态身份：** 完整规范状态相同，可直接共享计算。
- **调度单元：** 为覆盖或搜索排序临时归组，不能共享值。
- **认证商类：** 目标标签、动作所有权、双方动作对应、Chance 到各等价类的概率和后继价值均
  保持，才能共享策略值。

Markov 链 lumpability、概率双模拟和 game-based abstraction 都要求转移到每个等价类的概率保持
或给出保守上下界。动作数量、形状、期望伤害、单个代表值都不够。

来源：[Exact and ordinary lumpability](https://doi.org/10.2307/3215235)、
[Game-based abstraction for MDPs](https://www.dcs.gla.ac.uk/~gethin/papers/qest06.pdf)、
[近似有限 Markov 抽象](https://arxiv.org/abs/1504.00039)。

### 2. 激活顺序只能在交换证明后缩减

双人 reachability game 的 stubborn-set partial-order reduction 要求动作交换、目标可达和对手控制
边界等条件成立；概率程序中普通非概率 POR 条件也可能不保持概率。因此 corpse/soul、反应、
once-per-turn、击杀三阶段、Unit 联合动作或中间终局观察任一相关时，都不能仅因最终局面相同
而删除顺序。

来源：[双人可达博弈 Partial Order Reduction](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.CONCUR.2019.23)、
[概率程序 POR](https://doi.org/10.1109/QEST.2004.1348038)。

## 六、对当前实现的审计

### 已经具备的正确基础

- 四类 Steamroller 终局骨架及七场景专属可变状态分区；
- lifecycle、damage、resource、range、control、LOS、topology、scenario control 等因子；
- 终局根 strict materialization 和独立正向 replay；
- 反向义务、外存 DAG、Max/Min/Chance、精确有理概率与未决账；
- 当前规则收据和旧结果失效边界。

### 当前不能支持的声明

`steamroller-terminal-representative-selector-v1.mjs` 当前采用：

```text
skeletonSelection = deterministic_greedy_obligation_cover
subcellSelection  = legal_baseline_plus_single_dimension_variation
interactionStrength = 1
```

这意味着：

1. 只覆盖每个字段值至少出现，不覆盖字段组合；
2. 单个 strict 见证只证明该坐标非空，不证明整个 subcell 行为一致；
3. 没有初态可达测度、policy 占用分布或对手保证；
4. `proposedSubcellCount` 是组合账，不是概率质量；
5. 手写分区值不是由当前 rules interaction graph 自动证明完整；
6. Greedy set cover 解决的是覆盖成本，不是策略等价或终局代表性。

因此现有选择器应继续保留，但字段名和报告应明确为 **coverage scheduler**。它的输出可以送去
严格挑战，不能直接送入初态胜率汇总。

### 高阶交互反例

以一次远程攻击为例：

- 基线：LOS 清晰、无 Stealth、无 True Sight；
- 单变量 A：仅 Stealth；
- 单变量 B：仅 True Sight；
- 单变量 C：仅地形阻挡；
- 单变量 D：仅单位阻挡。

单维覆盖无法代表 `Stealth + True Sight + terrain blocked`，因为 True Sight 可能消除 Stealth，
却不必然消除地形或模型阻挡。若再加入云雾、Eyeless Sight、Elevation 或特殊 targeting 条款，
组合语义进一步分裂。正确方法是从规则关联图生成候选交互，并由 CEGAR 在真实后继不同时拆格；
t-way 只负责优先挑战。

## 七、建议的新流水线

### A. 终局公式编译器

输入当前 Steamroller/规则来源，输出：

- 终局公式 AST；
- 胜利优先级和结算时点；
- 必要状态变量与规则来源；
- 允许的 causal action family；
- 来源未决和规则漂移标记。

### B. 规则因果闭包与场景语法

interaction graph 从目标谓词反向展开到：动作前提、状态写入、触发读取、Chance、回应 owner、
生命周期和几何谓词。只生成闭包内变量的组合；与终局无关的模型先保留为参数包络，不擅自假设
满血在场或已死亡。

### C. 混合区域编译器

- 离散轴：投影 AllSMT / BDD / d-DNNF；
- 连续轴：距离、接触、LOS、区域、底盘碰撞和路径连通的半代数/区间单元；
- 混合权重：有先验时 WMI，无先验时只报告可满足性和区域测度；
- 每个单元绑定来源、约束、边界、具体见证及未决维度。

### D. 反向集合传播器

每个时层生成 `Pre_possible`、对抗上下界和 strict 见证请求。反向候选绝不因 LLM、战术分或
平均伤害低而消失。

### E. Strict 正向挑战与 CEGAR

对每个大单元至少挑战内部、边界和反例导向点：

- 代表失败：只反驳该见证；
- 同格两个见证行为不同：增加对应规则谓词并拆格；
- 正向从 `I` 无法接入：保留不可达候选，直到证明整格不可达或预算结束；
- 下界/上界差大：优先拆分对值影响最大的依赖。

### F. 两类求解输出

**认证轨：** 在可闭合的有限查询域上求 Max/Min/Chance 精确值或区间，只有未决为零才声明完整。

**顾问轨：** 对未闭合大域，用反向场景、AMS/CE、人工种子和策略种群产生高价值候选；Strict
自弈与反制迭代给经验结果。顾问轨不能把抽样未发现写成不存在。

### G. 场景档案

每个档案项应保存：

- 终局区域公式和具体场景；
- 初态/当前状态域；
- Strict 路线和所有 owner/Chance 分支；
- prior mass、policy probability、对抗值区间；
- 规则/数据/Host/地图/军表收据；
- 被拆分父单元、反例、未决质量；
- 玩家可读的获胜机制、对手最强已知反制和容错范围。

## 八、有限可解 Demo

在进入 103 模型真实域前，应先做一个能关闭 reduction 后全量穷举的数学对照。

### Demo 域

- 一张固定小地图；
- 双方各 2-3 个模型；
- 一个回合或两个激活时域；
- 刺杀与得分两个目标公式；
- 连续规则使用规则临界单元，同时建立一个细量化全图作独立真值；
- 包含一次对手反应、一次 Chance、一次 LOS 高阶交互。

### 必须回答

1. 终局公式编译出的所有符号格是否覆盖全量真值中的每个终局状态？
2. 每个保留单元的 lower/upper 是否包住所有具体状态值？
3. CEGAR 能否发现故意注入的 Stealth/True Sight/地形组合反例？
4. reduction 开/关是否得到同一值和可展开策略？
5. 把许多单条低于 `0.01` 的成功路线汇合后，累计概率是否仍守恒？
6. 从终局反向生成、从初态正向生成和两端相交，哪种实际减少 Host 调用且不漏真值？

只有该 Demo 达到零错误硬剪枝、概率守恒和区间覆盖，才能把同一算法扩展到固定 Cryx/Fane 域。

## 九、对现有 Ticket 的影响

本轮不应抹掉 Ticket 17/18/19 已完成的历史范围，也不应把调研记成新功能完成。合理场景生成
应作为现有开放主线的联合验收：

- **Ticket 20：** 生成规则谓词稳定的连续/离散 `Q_rule` 单元，并给出单元内动作、回应、Chance
  和后继稳定性；
- **Ticket 21：** 区分存在、固定 policy 概率和最坏对手值，执行多层反向/正向汇合；
- **Ticket 22：** 对单元等价、支配、POR 和 CEGAR 拆分签发独立证书；
- **Ticket 03/09/10：** 绑定军表/地图先验，展示场景区域、条件值、反制和未决质量；
- **Ticket 12：** 规则、卡牌或 interaction graph 更新时定向失效受影响单元；
- **Ticket 13/23：** 只有当前规则收据和任务域闭合后才发布认证值。

现有代表选择器保留为 Ticket 05/17 历史覆盖调度器。它不应被扩写成另一个规则器或未经证明的
策略压缩器。

## 最终判断

反向方法仍然适合本项目，因为刺杀和得分是稀疏目标，目标公式能比无引导正向搜索更早排除大量
无关变量与动作。但可行的版本不是“枚举所有精确终局，再一路倒推”，而是：

> 枚举并精化目标相关的符号终局区域；反向计算可能/可强制前驱；用 Strict 正向执行消除伪前驱；
> 在有限随机博弈上求值；用未决质量和区间诚实表示尚未覆盖的连续空间与策略。

它比纯正向好的地方是终局公式提供强约束，比纯反向好的地方是正向初态可达性、对手和 Chance
会及时消除虚假的历史组合。数学证据支持这种混合架构，但不支持在当前单维代表集上宣称“已经
包含全部合理局面”或“已经得到初始状态真实胜率”。
