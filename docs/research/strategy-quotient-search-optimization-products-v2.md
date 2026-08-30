# 目标条件化策略商搜索的成熟工具调研 v2

## 1. 调研范围

本文只使用产品官方文档、官方技术材料、官方源码或项目维护者仓库，调查以下工具是否已经实现与 Warmachine 目标条件化反向搜索相近的组合：

- 从终局或目标反向搜索；
- 由规则或运动约束判定合法性；
- 显式概率分支；
- 对手最优回应或对抗策略；
- 状态、动作或策略商空间；
- 可证明的上下界与安全剪枝；
- 规则、数据、地图或目标变化后的增量更新。

调查对象包括 PRISM-games、Storm、UPPAAL Stratego/Tiga、Gurobi、CPLEX、SCIP、PioSOLVER、GTO Wizard、Stockfish，以及 Fast Downward/SymK、OMPL/MoveIt、SBPL/Nav2 等规划工具。

资料检索截止日期：2026-08-25。

## 2. 结论摘要

### 2.1 没有单一现成产品覆盖完整链路

没有一个成熟工具同时原生提供“Warmachine strict 规则合法性、连续桌面几何、终局反推、双方对抗选择、骰子概率、目标条件化策略商、上下界证书和规则更新后的增量失效”。现成工具能复用的是架构原则和局部求解器，不是整套业务模型。

最接近本项目需求的组合是：

1. PRISM-games 提供 `MAX/MIN/CHANCE` 的有限随机博弈语义、属性条件化策略综合、多目标与策略回代验证。
2. UPPAAL 提供先综合许可式策略集合、再在该集合内优化的分层模式。
3. Gurobi、CPLEX、SCIP 提供 incumbent、合法松弛界、valid cut、局部/全局证书和受限增量求解。
4. Storm 提供从保守过近似开始、不能传回具体模型时继续精化的 CEGAR 结构。
5. OMPL、SBPL、Nav2 提供从目标侧搜索、状态/运动合法性回调、有限运动原语、可采纳启发式和地图变化后的增量重规划。
6. PioSOLVER、GTO Wizard 提供固定动作树内的对抗求值，以及通过重求解动作子集量化删动作损失的方法。
7. Stockfish 提供精确走法合法性、换位表、上下界型缓存、启发式剪枝后的验证搜索和有限终局表。

### 2.2 对 Warmachine 最重要的成熟共识

- 启发式只负责排序或寻找可行下界，不能独立证明一个分支可删除。
- 只有相对于完整模型合法的 bound、cut、simulation/dominance 或不可达证明，才能做硬剪枝。
- 所有概率与对手量词必须存在于模型本身，不能由单人路径搜索或静态评分代替。
- 抽象结果只对固定目标、动作集、信息集、规则版本和时域成立。
- 反向搜索应产生保守过近似；遗漏项属于 `unresolved`，不能写成“已证明无效”。
- 增量复用必须按依赖失效。旧 incumbent 可以作为候选，旧剪枝证书只有在其前提仍成立时才能继续使用。

## 3. 能力矩阵

符号说明：`●` 为工具原生核心能力，`◐` 为有限或特定模型下支持，`△` 为可编码或可借鉴但不是原生保证，`-` 为官方材料中没有对应能力。

| 工具 | 目标反向/双向 | 合法性约束 | 概率分支 | 对抗策略 | 商/对称压缩 | 上下界证书 | 增量更新 | 关键边界 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRISM-games | △ | ◐ | ● | ● | ◐ | ◐ | - | 输入有限随机博弈必须先完整、正确 |
| Storm | △ | ◐ | ● | ◐ | ● | ◐ | - | 官方主模型是 DTMC/CTMC/MDP/MA，不是完整双人桌游引擎 |
| UPPAAL Tiga/Stratego | △ | ● | ◐ | ● | ◐ | ◐ | ◐ | timed/stochastic automata 抽象必须由用户正确建立 |
| Gurobi | - | ● | △ | △ | ◐ | ● | ◐ | 只证明已编码数学模型，不证明 Host 等价 |
| CPLEX | - | ● | △ | △ | ◐ | ● | ◐ | user cut、lazy constraint 和 optimality cut 语义不可混用 |
| SCIP | - | ● | △ | △ | ● | ● | ● | reoptimization 只对受支持的模型变化安全复用 |
| PioSOLVER | - | ● | ● | ● | ◐ | ◐ | ◐ | 只求解用户预先定义的有限扑克动作树 |
| GTO Wizard | △ | ● | ● | ● | ◐ | △ | ◐ | 删动作损失是相对参考树的经验求值，不是原游戏完备性证明 |
| Stockfish | ◐ | ● | - | ● | ● | ◐ | ◐ | 有限深度选择性搜索不是全部有效策略枚举 |
| Fast Downward/SymK | ● | ● | - | - | ● | ◐ | - | 经典规划是确定性单主体模型 |
| OMPL/MoveIt | ● | ● | - | - | ◐ | ◐ | ◐ | 采样完整性与离散策略商完备性不是同一件事 |
| SBPL/Nav2 | ● | ● | - | - | ● | ● | ● | 保证只相对于给定网格、运动原语和代价模型 |

没有任何一行同时为全部 `●`。因此产品化方案应采用可替换求解后端，由 Warmachine strict Host、证书账本和版本收据统一约束。

## 4. 随机博弈与模型检查工具

### 4.1 PRISM-games

#### 官方能力

PRISM-games 支持回合制、并发和概率计时随机多人博弈。其属性语言以 rPATL 为基础，支持概率、奖励、多目标和均衡属性。[PRISM-games 官方主页](https://www.prismmodelchecker.org/games/)

回合制随机博弈中，每个状态属于一个玩家；动作之后可以进入概率分布。这个模型与本项目的 `MAX/MIN/CHANCE` 有直接对应关系。[PRISM-games 建模语言](https://www.prismmodelchecker.org/games/modelling.php)

属性由显式联盟量词、最大/最小概率、奖励和多目标条件定义。多目标并不是自动存在的通用“策略好坏”，而是查询的一部分。[PRISM-games 属性说明](https://www.prismmodelchecker.org/games/properties.php)

PRISM-games 可以导出综合出的策略，并将该策略与原博弈做 product，固定一个玩家的选择后继续验证其它属性。[PRISM-games 策略综合说明](https://www.prismmodelchecker.org/games/instructions.php)

#### 可复用架构

- 用有限状态随机博弈作为 `Q_goal` 的显式语义，而不是把对手动作混入普通候选列表。
- 每个目标集生成独立 property receipt，策略只对该目标集、联盟、时域和奖励定义有效。
- 候选策略生成后，固定策略并在完整博弈中重新验证。这可以对应本项目的独立 strict replay 和 opponent-response challenge。
- 对刺杀、场景获胜、存活、分差、资源等不应过早压成一个分数，可保留阈值查询或 Pareto 前沿。

#### 不可类比点

- PRISM-games 假设输入的状态、动作、概率和玩家归属已经完整。它不会发现漏掉的 charge lane、反应窗口、触发顺序或连续位置。
- PRISM 的符号表示压缩的是模型表示，不自动等于目标条件化策略等价。
- 数值求解精度不能替代规则闭包和概率质量闭包。
- 官方界面没有提供面向复杂桌面几何的通用终局前像生成器，也没有通用规则热更新后的增量证书复用。

### 4.2 Storm

#### 官方能力

Storm 官方模型页列出的核心模型是 DTMC、CTMC、MDP 和 Markov automata。MDP 中先解析非确定动作，再按所选动作的概率分布进入后继。[Storm 模型](https://www.stormchecker.org/documentation/background/models.html)

Storm 的 sparse、DD 和 hybrid 引擎分别面向显式、符号和混合表示。DD 引擎可以利用模型结构或对称性压缩大状态空间。[Storm 引擎](https://www.stormchecker.org/documentation/background/engines.html)

其 abstraction-refinement 引擎从具体模型的粗过近似开始；抽象结论若不能传回具体模型，就继续细化。官方同时限定该引擎目前主要面向离散时间 reachability。[Storm 引擎](https://www.stormchecker.org/documentation/background/engines.html)

Storm 支持 `Pmin/Pmax`、奖励、条件概率和多目标 Pareto 查询。部分多目标结果有明确 precision 与未决区域，而不是伪装成精确点值。[Storm 属性](https://www.stormchecker.org/documentation/background/properties.html) [Storm 运行说明](https://www.stormchecker.org/documentation/usage/running-storm.html)

#### 可复用架构

- `Q_rule` 先粗分，再用 Host 反例细化，而不是一开始固定不可修改的人工桶。
- 显式与符号后端分离。小型局部子图用显式稀疏结构，大量规则布尔谓词可尝试 DD 表示。
- 每个近似结果报告未决区域、概率误差和未探索质量。

#### 不可类比点

- Storm 官方主模型的非确定性通常代表调度、抽象或欠规定，不等于天然区分我方和对手的随机博弈。
- 现成 abstraction-refinement 引擎的适用范围不能直接覆盖 Warmachine 多回合、双人、连续几何和全规则目标。
- CEGAR 只能证明已经编码的具体系统；strict Host 与导出模型的等价性仍需本项目自己验证。

### 4.3 UPPAAL Tiga 与 Stratego

#### 官方能力

UPPAAL controller synthesis 在 timed game automata 中区分 controllable 和 uncontrollable 动作，`control` 查询要求策略在环境任意选择下满足目标。[UPPAAL Controller Synthesis](https://docs.uppaal.org/language-reference/query-syntax/controller_synthesis/)

`control: A[] safe` 返回许可式策略，同一状态可以保留多个安全动作。官方将其解释为满足安全性质策略的并集，同时明确它不保证进度，可能包含循环。[UPPAAL Controller Synthesis](https://docs.uppaal.org/language-reference/query-syntax/controller_synthesis/)

策略可以保存、加载、在已有策略约束下继续查询或学习优化。[UPPAAL Strategy Queries](https://docs.uppaal.org/language-reference/query-syntax/strategy_queries/)

Stratego 案例展示了先用符号博弈综合最坏对手下的安全控制器，再在该安全策略内用统计学习优化速度或成本。[UPPAAL Stratego 案例](https://uppaal.org/casestudies/stratego/)

官方明确区分符号查询的数学证明、统计查询的经验估计，以及学习查询在部分可观测下不保证收敛到最优策略。[UPPAAL Symbolic Queries](https://docs.uppaal.org/language-reference/query-syntax/symbolic_queries/) [UPPAAL Statistical Queries](https://docs.uppaal.org/language-reference/query-syntax/statistical_queries/) [UPPAAL Learning Queries](https://docs.uppaal.org/language-reference/query-syntax/learning_queries/)

#### 可复用架构

- 先构建“所有尚可能有效动作”的 permissive envelope，再让算法、skill 或 LLM 在其中排序。
- 规则安全、策略优化和经验学习分层报告，不能把学习评分当合法性证书。
- 若为了速度省略观测字段，必须留下抽象债务，并用反例恢复字段。

#### 不可类比点

- timed automata 的 clock zone 与 Warmachine 多模型连续平面、底盘碰撞和规则触发不是同一抽象。
- 许可式 safety 策略只保留满足指定安全性质的动作，不自动保留所有进攻、交换、得分与资源策略。
- 统计或学习优化不提供“全部有效策略商”的完备性证明。

## 5. 数学优化器

### 5.1 Gurobi

#### 官方能力

Gurobi MIP 日志把 `Incumbent`、`BestBd` 和 `Gap` 分开。incumbent 是已找到的可行解，best bound 来自尚未排除的搜索空间，两者收敛才支持最优性声明。[Gurobi MIP Logging](https://docs.gurobi.com/projects/optimizer/en/current/concepts/logging/mip.html)

官方参数指南明确说明，feasibility heuristics 用来寻找更好的可行解；增加启发式投入会减少推进 best bound 的资源。`ImproveStart*` 甚至可以切换为主要改进 incumbent 而不继续推进证明。[Gurobi Parameter Guidelines](https://docs.gurobi.com/projects/optimizer/en/current/concepts/parameters/guidelines.html) [Gurobi Parameter Reference](https://docs.gurobi.com/projects/optimizer/en/current/reference/parameters.html)

模型 API 支持修改变量、约束和系数后重新优化；求解器会根据变化决定是否继续已有优化信息。Gurobi 的 multi-scenario 功能可对共享变量和大部分结构的多个小变体一起求解，但只允许部分目标系数、界和 RHS 变化，而且 multi-scenario 只支持单一目标。[Gurobi Model API](https://docs.gurobi.com/projects/optimizer/en/current/reference/python/model.html) [Gurobi Multiple Scenarios](https://docs.gurobi.com/projects/optimizer/en/current/features/multiscenario.html)

#### 可复用架构

- `strict witness` 对应 incumbent，只证明“至少有一条可实现路线”。
- 未探索策略单元必须拥有 admissible upper bound，才允许与已实现 lower bound 比较并剪枝。
- 多个地图、部署种子或小幅 roster 参数变化可以共享基础模型，但每个场景仍需要独立目标值、界和收据。

#### 不可类比点

- Warmachine 的 LLM 分数、威胁估计或历史胜率不是自动可采纳的 bound。
- Gurobi 只证明用户编码的 MIP。若规则、几何或概率编码不等价于 strict Host，求解器会精确求解错误模型。
- 单一目标最优解不保留所有 Pareto 非支配策略类。
- multi-scenario 不是任意规则热更新机制，不能表达新增状态变量、触发窗口和整套规则语义变化。

### 5.2 CPLEX

#### 官方能力

CPLEX branch-and-cut 从连续松弛出发，通过 branch、cut、incumbent 和节点界管理搜索树。官方说明，修改内存中的问题并重新求解时，上一问题的解会保留为可能的起点。[CPLEX Branch and Cut](https://www.ibm.com/docs/en/icos/22.1.2?topic=concepts-branch-cut-in-cplex)

CPLEX 区分 global cut 与 local cut。global cut 对整棵树有效，local cut 只对当前节点及其后代有效。[CPLEX Cuts](https://www.ibm.com/docs/en/icos/22.1.1?topic=cuts-what-are)

官方特别警告：user cut 必须由原模型推出，不能删除合法整数解；lazy constraint 是完整可行域不可缺少的约束。把必要约束错误标为 user cut 可能产生错误结果。symmetry-breaking 等 optimality-based cut 可以删除部分可行解，只要求保留至少一个最优解，因此也不等于保留全部策略类。[CPLEX User Cuts and Lazy Constraints](https://www.ibm.com/docs/en/icos/22.1.1?topic=pools-differences-between-user-cuts-lazy-constraints)

#### 可复用架构

- 将剪枝证书类型化为 `global_valid_cut`、`local_valid_cut`、`rule_infeasible`、`upper_bound_cut` 和 `heuristic_only`。
- strict Host 可作为 lazy legality separator：数学松弛产生候选，Host 在整数候选处验证并返回违反的规则约束。
- 旧路线只作为 MIP start，不自动继承旧最优性结论。

#### 不可类比点

- Host reject 原因不一定能自动转成对整个节点有效的 cut。只针对一个具体状态的失败，最多形成 local no-good 或 refinement witness。
- symmetry-breaking 只保证保留某个最优解时，可能删除本项目要展示的其它有效策略类。
- 修改规则后旧 cut 是否仍有效，必须由依赖收据判断，不能依赖求解器缓存。

### 5.3 SCIP

#### 官方能力

SCIP 的 constraint handler 定义一种约束的语义，并负责在整数候选和松弛解上检查、传播、切割或分支。官方文档明确要求 `CONSCHECK` 对任意候选判断全局可行性。[SCIP Constraint Handlers](https://scipopt.org/doc/html/CONS.php)

SCIP 的对称处理只接受保持目标与可行域不变的排列或符号排列，并通过约束图接口让自定义约束参与对称检测。[SCIP Symmetry Handling](https://www.scipopt.org/doc/html/SYMMETRY.php)

SCIP reoptimization 面向一系列相关模型，可复用搜索树和前沿，但官方列出了限制：会关闭若干依赖旧目标或对偶信息的预处理与归约，并在不能安全复用时重建或重启。[SCIP Reoptimization](https://scipopt.org/doc-4.0.0/html/REOPT.php) [SCIP Reoptimization API](https://scipopt.org/doc/html/group__PublicReoptimizationMethods.php)

#### 可复用架构

- 为 list construction、资源预算、部署离散变量和规则组合开发领域约束处理器，strict Host 保持最终可行性检查权。
- 对称商只在规则、目标、地图和模型身份均保持不变时成立。比如同一 Unit 中行为完全等价的匿名模型可以尝试排列商；有伤害、状态、装备或触发资格差异时必须拆开。
- 增量求解需要显式区分“只改目标/界”和“改变状态空间或规则语义”。前者可 warm reopt，后者默认失效重建。

#### 不可类比点

- SCIP 的对称是数学模型自同构，不是“两个动作看起来战术相似”。
- 约束处理器仍要求把 Warmachine 规则表达成正确的数学语义。
- reoptimization 的复用范围有限，不能把旧搜索树跨 ruleset receipt 无条件续跑。

## 6. 商业博弈求解器

### 6.1 PioSOLVER

#### 官方能力

PioSOLVER 要求用户在求解前给定双方 range、底池、筹码、下注与加注尺寸等动作树参数。动作树可以添加、删除或强制特定 line。[PioSOLVER Technical Details](https://piosolver.com/docs/technical_details/) [PioSOLVER Tree Building](https://piosolver.com/docs/viewer/postflop_tree_building/)

求解质量用 exploitability per hand 表示，即知道当前策略的完美对手还能额外获得多少价值。完整树可以保存并继续求解；小型保存通过丢弃后续细节换取空间，但不能保留完整续算能力。[PioSOLVER Technical Details](https://piosolver.com/docs/technical_details/) [PioSOLVER Saving Trees](https://piosolver.com/docs/viewer/saving_trees/)

#### 可复用架构

- 每个对抗值必须绑定精确 action-tree contract；树外动作不能被低 exploitability 掩盖。
- 保存完整求解状态与只保存可浏览报告应使用不同 artifact 类型。
- 用最佳回应评估候选策略，而不是只运行双方合作式路线。

#### 不可类比点

- PioSOLVER 的 Chance 来自固定扑克发牌规则，合法动作结构远小于 Warmachine 的连续移动与规则触发。
- 低 exploitability 只对用户给定树成立。漏掉一个 Warmachine 合法动作族后，树内结果仍可能看起来很好。
- 保存并续算要求动作树不变，不能代表 ruleset/data 更新后的语义连续性。

### 6.2 GTO Wizard

#### 官方能力

GTO Wizard 官方说明，扑克求解器必须先限制下注尺寸、下注轮数或牌类，求解器实际上优化的是这个抽象子博弈。树过小会让策略利用树本身的限制。[GTO Wizard: How Solvers Work](https://blog.gtowizard.com/how-solvers-work/) [GTO Wizard: Poker Subsets and Abstractions](https://blog.gtowizard.com/poker-subsets-and-abstractions/)

Dynamic Sizing 2.0 在一个节点上枚举动作子集，为每个子集和完整动作集建立小型限深树并分别求解，再比较删动作造成的 EV 损失。[GTO Wizard Dynamic Sizing 2.0](https://blog.gtowizard.com/introducing_dynamic_sizing_2/)

GTO Wizard AI 使用神经网络提供截断后的价值估计以避免展开完整后续街。官方同时说明这是快速自定义求解架构，而不是对未展开完整树的形式化完备证明。[GTO Wizard AI Explained](https://blog.gtowizard.com/gto-wizard-ai-explained/)

#### 可复用架构

- 对每个准备删除的动作类做 complement challenge：在保留动作与被删动作各自的限深子图中重求解，量化目标损失。
- 先从丰富动作集合开始，再按证据缩小；不要从很小的人工动作树推断原游戏没有其它有效策略。
- learned value 可以做调度与 provisional estimate，但报告必须注明截断位置和模型版本。

#### 不可类比点

- Dynamic Sizing 的 EV loss 相对于参考动作树，不是相对于连续原游戏的严格上界。
- 神经网络叶值没有可采纳性证明，不能直接成为 Warmachine 的 hard prune certificate。
- 扑克信息集、筹码和下注结构固定；Warmachine 还需要空间可达性、模型阻挡、历史事件和卡牌规则闭包。

### 6.3 Stockfish

#### 官方能力

Stockfish 源码使用迭代加深 alpha-beta、换位表、静态评估、futility pruning、null-move pruning 及 verification search 等选择性技术。源码中的换位表项保存深度和 bound 类型，搜索只在满足条件时使用上下界截断。[Stockfish search.cpp](https://github.com/official-stockfish/Stockfish/blob/master/src/search.cpp) [Stockfish tt.cpp](https://github.com/official-stockfish/Stockfish/blob/master/src/tt.cpp)

换位表通过局面键复用不同走法顺序到达的同一局面，但官方源码也明确处理哈希碰撞与历史相关规则的边界。[Stockfish tt.cpp](https://github.com/official-stockfish/Stockfish/blob/master/src/tt.cpp) [Stockfish search.cpp](https://github.com/official-stockfish/Stockfish/blob/master/src/search.cpp)

Syzygy tablebase 在有限子力终局中提供精确结果。Stockfish 在根局面属于表库时先筛选保持胜或和的动作；在树内也会探测可达表库局面。[Stockfish Advanced Topics](https://official-stockfish.github.io/docs/stockfish-wiki/Advanced-topics.html)

#### 可复用架构

- 对完全相同的 `Q_rule` 状态使用换位缓存，并在缓存项中保存 `EXACT/LOWER/UPPER`，不要把点估计伪装成 exact。
- 先用启发式缩减搜索，再对高风险剪枝做 verification search。
- 对足够小、规则闭合的有限终局子空间，可以离线生成精确 tablebase，作为反向终局库。

#### 不可类比点

- Stockfish 没有骰子 Chance，棋盘离散且走法合法性固定。
- 选择性搜索在有限深度下可能错过策略；其强度来自大量回归测试，不是全部有效策略商证明。
- Syzygy 的精确性只存在于严格限定的棋子数和规则状态。Warmachine tablebase 也必须绑定地图、军表、回合、资源、状态和规则收据。
- 换位表相等要求未来行为等价；不能仅凭相似位置或相同静态评分合并。

## 7. 经典规划与机器人路径规划

### 7.1 Fast Downward 与 SymK

#### 官方能力

Fast Downward 是确定性、全信息经典规划系统，将 PDDL 转为有限域表示后执行启发式图搜索。[Fast Downward 官方仓库](https://github.com/aibasel/downward) [Fast Downward 文档](https://www.fast-downward.org/HEAD/documentation/)

其生态中的 SymK 提供 symbolic forward、backward 和 bidirectional 搜索，并支持 top-k 或所有计划。官方说明默认 relevance analysis 会删除与目标无关的变量和动作；若要枚举包含无关动作的全部计划，必须显式关闭相关优化。[SymK 官方仓库](https://github.com/speckdavid/symk)

#### 可复用架构

- 终局集合可用符号反向搜索，开局可达集合可用正向搜索，两侧在同一有限谓词表示中相交。
- relevance reduction 必须相对于目标明确定义，并提供关闭开关与被删分母。
- top-k 路线和“全部策略类”是不同产品模式，不能共用一个完成标记。

#### 不可类比点

- 经典规划没有对手与骰子，不提供随机博弈中的交替量词。
- PDDL/SAS+ 动作已离散且完整；Warmachine 连续路径、部署和 Unit formation 需要先建立 `Q_rule`。
- “与目标无关”的动作可能影响 Warmachine 下一回合对手回应、场景位置或资源，因此 relevance proof 必须覆盖完整时域。

### 7.2 OMPL 与 MoveIt

#### 官方能力

OMPL 的 RRTConnect 同时维护 start tree 与 goal tree，并连接两棵树；导出的 PlannerData 会把 goal tree 边反向表示以保持路径方向一致。[OMPL RRTConnect 源码](https://ompl.kavrakilab.org/RRTConnect_8cpp_source.html)

OMPL 通过 `StateValidityChecker` 和 `MotionValidator` 分别检查状态与状态间运动。官方 primer 明确指出，默认离散运动验证只检查有限插值点，因此仍是近似碰撞验证。[OMPL Primer](https://ompl.kavrakilab.org/OMPL_Primer.pdf)

优化目标可以提供 admissible cost-to-go 和 motion-cost heuristic；OMPL 同时区分可采纳估计与可能不可采纳的 best estimate。[OMPL OptimizationObjective](https://ompl.kavrakilab.org/core/classompl_1_1base_1_1OptimizationObjective.html)

MoveIt PlanningScene 将自碰撞、环境碰撞、运动学约束和用户回调约束集中在一个合法性接口中。[MoveIt Planning Scene](https://moveit.picknik.ai/main/doc/examples/planning_scene/planning_scene_tutorial.html)

#### 可复用架构

- 连续几何采用“搜索器提出路径，strict Host 验证状态和整段运动”的接口分离。
- start/goal 双树适合快速发现一条连接路线，反向端可从终局谓词单元采样。
- admissible heuristic 与普通排序估计使用不同类型和 API。
- 将障碍、底盘、terrain、LOS 和特殊接触统一到可版本化的 PlanningScene 类对象。

#### 不可类比点

- RRTConnect 主要回答是否找到一条路径，不枚举全部策略等价类。
- 概率完备或渐近最优是采样极限性质，不等于有限时间内的完备商账本。
- OMPL 默认没有对手、Chance、回合激活顺序和事件触发。
- 只检查有限路径插值点可能漏掉窄碰撞，不能替代 Warmachine strict swept-base 几何。

### 7.3 SBPL 与 Nav2

#### 官方能力

SBPL 在离散网格或 lattice 上组合 motion primitives。官方仓库示例直接支持 forward 或 backward search。[SBPL 官方仓库](https://github.com/sbpl/sbpl)

Nav2 Smac Planner 将 A*、Hybrid-A* 和 State Lattice 统一在模板框架内。Hybrid 与 Lattice 使用运动学可行的运动模型和 SE2 footprint collision checking；状态空间通过位置、朝向格和运动原语离散化。[Nav2 Smac Planner](https://github.com/ros-navigation/navigation2/blob/main/nav2_smac_planner/README.md)

Nav2 可以缓存对同一目标的 obstacle heuristic 以加速重规划，但官方强调真正碰撞检查仍使用最新 costmap，因此旧缓存只影响引导，不影响安全判定。[Nav2 Tuning Guide](https://docs.nav2.org/tuning/index.html)

#### 可复用架构

- 将 Warmachine 移动拆成有限“规则允许的运动原语”，例如 advance、run、charge、place、push、slam、reposition，并由 Host 参数化速度、转角、接触与终点约束。
- 反向几何搜索可使用 goal-rooted lattice heuristic，但每条具体路径仍由 Host 验证。
- 缓存旧启发式可以跨小地图变化复用，合法性必须读取最新规则与地图。
- 网格/朝向精度、动作原语集合和 footprint 都必须进入 quotient receipt；改变任一项都使完备性证书失效。

#### 不可类比点

- lattice 的 resolution completeness 只针对给定离散网格和 motion primitives，不代表连续空间全部可行路线。
- 机器人路径规划通常只有单主体和静态或外生障碍，不处理对手主动占位、反应攻击和概率伤害。
- 惩罚代价用于选路，不是 Warmachine 战术支配证明。

## 8. 可复用的统一架构

### 8.1 四层系统，而不是单一搜索器

建议将成熟工具的能力组合为四层：

1. `Strict Host`：唯一规则与几何真值源，负责合法动作、完整转移、骰子分布和事件窗口。
2. `Q_rule`：按所有未来 Host 可观测谓词做有限商，要求同一单元内合法动作族与后继分布稳定。
3. `Q_goal`：针对固定目标、时域、地图、军表和信息集形成许可式策略包络，并维护上下界。
4. `Search/Report`：反向发现、正向补集挑战、对手求值、CEGAR、调度和可视化。

外部求解器只处理导出的有限子问题。它们不得绕过 Host，也不得直接把求解器状态标成规则真值。

### 8.2 反向与正向的职责

反向搜索负责从刺杀、得分或复合终局生成必要条件包络：

- 终局目标谓词；
- 最后一动作族；
- 资源、位置、LOS、射程和触发的前像；
- 上一激活、上一回合和部署前像；
- 每一层的合法性债务与概率质量。

正向搜索负责：

- 从 strict 合法初态证明具体可达；
- 挑战反向搜索遗漏的 `Q_rule` 单元；
- 固定候选策略后枚举对手回应与 Chance；
- 为抽象伪路径生成 CEGAR 反例。

这对应 Storm 的过近似精化、UPPAAL 的许可式策略和 PRISM-games 的策略 product，而不是简单的“反向快、正向慢”。

### 8.3 类型化剪枝账本

每个策略单元只能进入以下一种 disposition：

| 类型 | 允许硬剪枝 | 所需证据 |
| --- | --- | --- |
| `strict_rule_infeasible` | 是 | Host 对整个单元的规则/几何不可能证明 |
| `proven_unreachable` | 是 | 完整前像或正向可达性证书 |
| `alternating_dominance` | 是 | 对我方、对手和 Chance 量词正确的单向 simulation/dominance witness |
| `upper_bound_pruned` | 是 | admissible 上界被 concrete lower witness 或 Pareto 下界严格压住 |
| `exact_quotient_merge` | 合并而非删除 | 双向概率交替 bisimulation 与目标观测相同 |
| `heuristic_deprioritized` | 否 | 任意经验评分，只改变调度 |
| `sampled_low_value` | 否 | 仿真、LLM、skill 或 learned value |
| `unresolved` | 否 | 尚无证书，进入补集挑战队列 |

这直接吸收 MIP 的 incumbent/bound、CPLEX 的 valid cut、SCIP 的约束语义、PRISM-games 的对抗量词和 Storm 的未决精化。

### 8.4 上下界与概率

每个候选或商单元至少保存：

- 已由 strict forward replay 达成的结果向量下界；
- 对未探索动作、对手回应和 Chance 质量的分量上界；
- 完整概率分布或明确的 missing mass；
- bound 的依赖字段和适用前缀；
- exact、lower、upper、empirical 四种互斥质量标签。

单一加权分数只适合节点排序。多目标硬剪枝需要整套乐观上界集合被当前 concrete Pareto 下界支配。

### 8.5 商空间实现

可安全合并的 `Q_rule` 单元必须满足：

1. 当前规则观测、玩家、回合窗口、历史资格、资源和目标标签一致；
2. 暴露相同合法动作族；
3. 对每个动作，后继 `Q_rule` 单元及 Chance 概率可以双向匹配；
4. 对手可选回应集合相同；
5. 终局、分数、伤害、控制、LOS、碰撞和触发谓词不在单元内部变化。

MIP/SCIP 的 symmetry、Stockfish 的 transposition、Storm 的 DD 和机器人 lattice 都只能作为实现手段。它们不能放宽上述行为等价条件。

## 9. 增量更新设计

### 9.1 可复用内容

从成熟工具可以安全借鉴三种增量复用：

- `warm start`：旧路线、旧策略或旧部署只作为新模型的可行候选。
- `heuristic cache`：旧距离、威胁或价值只引导搜索，合法性仍由最新 Host 判定。
- `certified reuse`：只有证书依赖的规则、数据、地图、目标和状态分区全部未变，才能继续作为 hard prune。

### 9.2 依赖收据

每个 artifact 应绑定：

- Host source receipt；
- ruleset/data snapshot；
- rule atom 与 interaction-graph 依赖闭包；
- 地图、terrain、scenario、军表、配装和模型身份；
- 先后手、部署、回合、时域和信息集；
- `Q_rule` 分区版本与 motion primitive 版本；
- 目标向量、阈值和 Pareto 偏好；
- 概率模型和数值精度；
- 外部求解器、参数与 action-tree contract。

### 9.3 失效矩阵

| 变化 | 可保留 | 必须失效或重验 |
| --- | --- | --- |
| 仅搜索预算增加 | 完整状态图、旧 witness、有效证书 | 未决队列继续展开 |
| 仅目标权重变化，目标维度不变 | `Q_rule`、strict replay | `Q_goal` dominance、upper-bound prune、排序 |
| 目标维度或终局定义变化 | `Q_rule` | `Q_goal`、策略与所有目标相关证书 |
| 地图障碍变化 | 非几何规则原子、部分旧 witness 提案 | 几何单元、路径、LOS、碰撞、场景位置证书 |
| 单位数据或特规变化 | 无关依赖闭包的 artifact | 受影响 interaction closure、动作、概率、商与策略 |
| Host 执行代码变化 | 仅文档与原始输入 | 所有 strict replay、合法性与转移证书 |
| motion primitive 或几何分辨率变化 | 原始连续状态与规则 | lattice 完备性、路径商、距离 bound |

SCIP reoptimization 和 Nav2 stale-heuristic-safe 模式说明了正确方向：复用搜索努力，但让最新约束检查保持最终裁决权。

## 10. Warmachine 集成建议

### 10.1 第一阶段：有限子图外部对照实验

选择一个固定 ruleset、地图、军表、先后手、第三回合终局根和有限几何分区：

1. 从 Host 导出显式 `MAX/MIN/CHANCE` 子图与 exact rational 概率。
2. 用本地 strategy-quotient 求值器计算 reachability、lower/upper 和 disposition ledger。
3. 将同一有限子图编码到 PRISM-games，比较每个状态的值与策略。
4. 固定综合策略，再由 Host 独立 replay 所有动作和 Chance 分支。
5. 人工注入漏动作、错误对手回应、错误概率和错误合并，确认门禁 fail closed。

PRISM-games 在这里是独立求值对照，不是 Warmachine 规则执行器。

### 10.2 第二阶段：几何商与目标反推

1. 参考 SBPL state lattice，为每类移动建立规则感知 motion primitive。
2. 参考 OMPL 双树，从终局几何单元和真实开局同时扩张。
3. 每条路径由 Host 做 swept-base、terrain、模型阻挡、终点摆放和事件触发验证。
4. 参考 Nav2，将可缓存的几何启发式与必须读取最新状态的合法性检查分开。
5. 对分区内部出现不同合法动作或后继的单元执行 CEGAR split。

### 10.3 第三阶段：构筑与资源子问题

Gurobi、CPLEX 或 SCIP 更适合处理军表、配装、资源预算、部署离散模板和终局需求匹配，而不是直接承担整个对局：

- Host 生成或验证规则约束；
- 求解器生成满足根需求的候选构筑；
- strict simulation 验证实际可达；
- 候选目标上界与 concrete witness 下界进入统一账本；
- LLM 只解释和提出启发式，不参与 hard legality 或概率裁决。

若需要自定义规则约束，SCIP constraint handler 或 CPLEX lazy constraint 的结构比把所有失败写成一次性 no-good 更可维护。

### 10.4 第四阶段：动作缩减实验

参考 GTO Wizard Dynamic Sizing，但提高证明标准：

1. 对每个动作族建立 full local envelope。
2. 枚举准备保留的动作子集。
3. 在相同对手、Chance、时域和叶值边界下分别求解。
4. 记录删动作造成的 lower-bound 损失、upper-bound 变化和未决质量。
5. 只有严格证书成立时才 hard prune；其它结果仅用于调度。

这种实验可以论证启发式缩减是否有效，但不能单独证明动作空间完备。

### 10.5 第五阶段：精确小型终局库

参考 Syzygy tablebase，对状态数可控的局部终局生成 exact tablebase：

- 少模型刺杀；
- 固定场景区的末回合得分；
- Tough、revive、corpse、fury/focus 等有限资源交互；
- 固定 terrain 与规则版本。

表库键必须包含全部未来相关历史与资源字段。超出表库范围时只作为边界值或启发式，不外推精确性。

## 11. 建议采用的产品边界

### 可以声明

- 在固定 Host/data/map/roster/horizon/objective receipt 下，某个有限 `Q_rule` 子图已完成对抗概率求值。
- 某条路线是 strict 合法的 concrete lower witness。
- 某个分支因规则不可行、对抗支配或 admissible upper bound 被安全剪枝。
- 某个动作缩减在指定参考树和时域内造成的可量化值损失。
- 某次规则更新只重验了依赖闭包内的 artifact，且其它证书依赖未变化。

### 不可以声明

- 只因反向搜索没有发现，就认为正向空间不存在有效策略。
- 只因 GTO/Stockfish/LLM 评分低，就删除动作。
- 只因坐标接近、静态分数相同或期望值相同，就合并状态。
- 只因一个有限动作树 exploitability 低，就认为原始 Warmachine 对局接近最优。
- 只因采样搜索长时间没有反例，就认为连续空间完备。
- 跨 ruleset、地图、军表或目标变化复用旧 hard-prune 证书而不检查依赖。

## 12. 最终判断

成熟工具对本项目的最大帮助不是提供一个可直接替换的搜索器，而是给出一套已经反复验证的职责边界：

- PRISM-games 定义对抗概率与策略回代；
- UPPAAL 定义许可式策略先于性能优化；
- Storm 定义过近似与反例精化；
- Gurobi、CPLEX、SCIP 定义可行下界、合法上界和 valid cut；
- PioSOLVER、GTO Wizard 定义动作树合同与删动作损失审计；
- Stockfish 定义换位、bound 类型、验证搜索与有限终局表；
- Fast Downward/SymK 定义目标相关反向和双向符号搜索；
- OMPL、SBPL、Nav2 定义目标树、运动合法性、有限 motion primitives 和安全增量重规划。

Warmachine 应采用这些机制的组合，并让 strict Host、版本收据、typed disposition ledger 和 independent forward challenge 成为统一可信边界。按照这个结构，反向搜索可以有效缩小目标相关空间，但任何未被正式证书覆盖的剩余空间都必须保持 `unresolved`，直到被正向挑战、CEGAR 精化或合法上下界关闭。
