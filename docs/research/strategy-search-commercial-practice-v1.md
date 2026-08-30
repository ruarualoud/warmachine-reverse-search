# 目标条件化策略搜索的成熟工具实践调研 v1

日期：2026-08-25

## 1. 调研问题与结论

本调研考察以下工程目标是否已有成熟工具采用相近方法：

> 从完整规则空间出发，以胜利目标反向缩小候选域；只凭可复核证书安全剪枝；在缩域外进行独立正向反例搜索；最终得到有限、目标条件化并保留全部有效策略类别的策略商。

结论是：**没有一个被调研工具同时提供这条完整链路**，但四类成熟实践可以组合成一套可信方案。

1. Gurobi、CPLEX 给出最强的剪枝纪律：启发式只能尽快找到可行 incumbent，真正排除整片空间必须依赖对该片空间成立的合法 bound、不可行证明或 valid cut；未搜索空间由 best bound 和 optimality gap 继续计账。
2. PRISM-games、Storm、UPPAAL 给出博弈语义：必须显式区分我方、对手和概率转移；粗抽象应是保守过近似，结论不能下推时继续精化；安全策略集合可以先由符号综合得到，再在其内部优化性能。
3. PioSOLVER、GTO Wizard 给出动作抽象的声明边界：低 exploitability 或 Nash distance 只对已经建出的有限下注树成立。省略的下注尺寸没有自动包含在证明里，动作树抽象不能冒充原始连续动作游戏的完整策略商。
4. Stockfish 给出高性能启发式搜索的边界：futility pruning、null move、LMR 等方法可以显著增强实战搜索，但其变更主要靠大规模对局统计验证强度，不会为被删分支出具全局策略完备性证书。

因此，本项目应采用的不是“反向找到一些好路线，再在这些路线里正向验证”，而是：

- 反向阶段生成所有潜在有效策略的**过近似包络**；
- 每个被排除类别必须有独立可复核的处置证书；
- 正向阶段既物化包络内候选，也独立挑战包络外仍未被证明无效的部分；
- 只要仍有未决类别，就不能声称“包含全部有效策略商”。

## 2. 工具分类

| 工具 | 类型 | 成熟度/开放性 | 与本项目最相关的机制 |
| --- | --- | --- | --- |
| Gurobi | 商业数学优化器 | 商业闭源，官方文档公开 | branch-and-bound、incumbent、valid bound、MIP gap、可行启发式 |
| IBM ILOG CPLEX | 商业数学优化器 | 商业闭源，官方文档公开 | branch-and-cut、valid cut、best node、cutoff、optimality status |
| PRISM-games | 随机博弈模型检查器 | 学术成熟工具，研究用途可获取 | 对抗与概率量词、策略综合、多目标 Pareto、策略回代验证 |
| Storm | 概率模型检查器 | 成熟开源工具 | 粗过近似、抽象精化、按属性查询、上下界/精度边界 |
| UPPAAL Stratego/Tiga | 实时博弈与策略综合工具 | 成熟工具，学术许可与部分商业许可 | 可控/不可控动作、符号安全策略、许可式策略、受安全策略约束的学习优化 |
| PioSOLVER | 扑克博弈求解器 | 商业闭源 | 用户定义有限动作树、best response exploitability、断点续算 |
| GTO Wizard | 在线扑克分析产品 | 商业闭源 | 动作树抽象、Nash distance、动作子集重求解、removal regret/动态下注尺寸 |
| Stockfish/Fishtest | 国际象棋引擎与测试平台 | 成熟开源项目 | 选择性 alpha-beta、启发式剪枝、验证搜索、分布式统计回归 |

## 3. Gurobi：incumbent 用来加速，bound 才允许剪枝

### 3.1 官方材料确认的机制

Gurobi 对 MIP 的官方说明把搜索分成两个不同角色：

- incumbent 是当前已知的整数可行解，对最小化问题提供一个可实现的上界；
- 所有未处理叶节点的松弛值共同形成 best bound；
- 一个节点只有在不可行，或其松弛 bound 已不能改善 incumbent 时，才可 fathom；
- incumbent 与 best bound 的差形成 gap，gap 收敛才支持最优性声明。

官方入门文档明确说明，节点的 LP relaxation 给出该子树能达到的最好可能值，若已经不优于 incumbent，就可以丢弃整棵子树；当没有未探索分支时，incumbent 才成为原问题最优解。[Gurobi，Mixed-Integer Programming Basics](https://www.gurobi.com/resources/blog/mixed-integer-programming-an-introduction-to-the-basics)

Gurobi 日志把 `Incumbent`、`BestBd` 和 `Gap` 分开报告，并说明最优目标总在 incumbent 与叶节点给出的 bound 之间。[Gurobi，MIP Logging](https://docs.gurobi.com/projects/optimizer/en/current/concepts/logging/mip.html)

启发式的职责也被明确限定为寻找可行解。提高 `Heuristics` 可能更快得到更好的可行解，但会减少推进 best bound 的资源；`ImproveStart*` 甚至允许放弃证明最优性而专注改进可行解。[Gurobi，Parameter Guidelines](https://docs.gurobi.com/projects/optimizer/en/current/concepts/parameters/guidelines.html)

Gurobi 还明确区分达到时间、节点等限制与最优终止；这些限制会返回非最优状态。浮点可行性与最优性也受 tolerance 约束，不能把数值求解结果误写成无条件数学等式。[Gurobi，Parameter Groups](https://docs.gurobi.com/projects/optimizer/en/current/concepts/parameters/groups.html) [Gurobi，Constraints and Tolerances](https://docs.gurobi.com/projects/optimizer/en/current/concepts/modeling/constraints.html)

### 3.2 可借鉴机制

对 Warmachine，每个反向缩域单元也应同时持有两种不同证据：

- `lower witness`：一条已经由 strict Host 正向执行成功的可实现策略或路线；
- `upper certificate`：该未探索单元在最乐观情况下仍能达到的目标向量上界。

反向启发式、LLM、skill、动作频率和历史胜率只能帮助尽快找到 lower witness 或安排节点顺序。它们不能单独成为删除空间的理由。

对于单一标量目标，只有当某单元的 admissible upper bound 不优于现有 lower bound，才可作 bound-pruned。对于多目标策略集合，应比较上界集合与当前 Pareto 下界前沿；只有整个上界集合都被前沿支配时才可删除。

### 3.3 不能照搬之处

- Gurobi 的合法 bound 来自用户给出的数学模型与可证明松弛。Warmachine 的 LLM 策略分数、威胁评分或近似胜率不是天然的 admissible bound。
- 一个固定加权目标的最优解不等于保留所有有效策略。若要保留所有 Pareto 非支配策略类别，必须固定目标向量并对向量上界计账。
- Warmachine 有对手选择、骰子概率、历史依赖、连续几何和规则版本。把它压成 MIP 前必须先证明编码与 strict Host 等价，否则优化器只会正确求解错误模型。

## 4. CPLEX：valid cut 不删合法解，错误 user cut 会让结果错误

### 4.1 官方材料确认的机制

CPLEX 的 branch-and-cut 文档把每个节点定义为一个 LP/QP 松弛子问题。算法从完整根节点开始，建立 incumbent，解节点松弛，加入 cuts，再根据不可行、整数可行或继续分支处理节点。[IBM，Branch and Cut in CPLEX](https://www.ibm.com/docs/en/icos/22.1.2?topic=concepts-branch-cut-in-cplex)

CPLEX 对 cut 的关键声明是：cut 限制连续松弛中的分数解，但不排除合法整数解。global cut 对整棵树有效，local cut 只对一个节点及其后代有效。[IBM，What Are Cuts](https://www.ibm.com/docs/en/icos/22.1.1?topic=cuts-what-are)

找到整数解后，CPLEX 把它设为 incumbent，并剪掉目标值不可能优于 incumbent 的子问题。[IBM，When an Integer Solution Is Found](https://www.ibm.com/docs/en/cofz/12.9.0?topic=optimizer-when-integer-solution-is-found-incumbent)

CPLEX 用 best node 与 incumbent 形成 MIP gap。无活动节点且 gap 收敛时才证明最优；也允许按时间、节点数或非零 gap 提前停止。[IBM，Terminating MIP Optimization](https://www.ibm.com/docs/en/icos/22.1.1?topic=optimizer-terminating-mip-optimization)

其状态码还区分 `CPXMIP_OPTIMAL` 与 `CPXMIP_OPTIMAL_TOL`，后者只是在用户设定的相对或绝对 gap 容差内看起来最优。[IBM，CPXMIP_OPTIMAL](https://www.ibm.com/docs/en/icos/22.1.2?topic=api-cpxmip-optimal)

最重要的工程警告来自 user cut 文档：若用户把并不合法的约束误标成 user cut，可能得到不可预测或错误结果；lazy constraint 则是完整模型不可缺少的约束，必须在整数候选处检查。[IBM，User Cuts and Lazy Constraints](https://www.ibm.com/docs/en/icos/22.1.1?topic=pools-differences-between-user-cuts-lazy-constraints)

### 4.2 可借鉴机制

本项目应把剪枝理由类型化，而不是把所有 `restrict/reject/pruned` 混成一个状态：

- `rule_infeasible`：strict Host 或完整规则谓词证明不可执行；
- `global_valid_cut`：对当前 ruleset、地图、军表、目标基和时域内所有状态成立；
- `local_valid_cut`：只对一个精确前缀、单元或历史成立；
- `dominance_cut`：有对抗量词正确的支配证书；
- `upper_bound_cut`：有合法乐观上界及被 incumbent/Pareto 前沿压住的证明；
- `heuristic_deprioritized`：仅改变调度，不得从完备性分母中删除；
- `unresolved`：尚无证书，必须保留。

规则更新、地图变化、目标向量变化后，global/local 证书都必须按依赖收据失效，不能继续复用。

### 4.3 不能照搬之处

- CPLEX 的 cut validity 相对于已经完整编码的 MIP 可行域。本项目必须额外证明“编码可行域等于 strict rules 行为空间”。
- symmetry-breaking 一类 optimality-based cut 可以删除部分合法解但保留某个最优解；它不一定保留所有策略类别。若目标是“全部有效策略商”，只能在证明被删策略与保留策略目标等价后使用。
- cutoff 是用户主动声明“不关心更差解”的边界，不是自然事实。策略报告必须保存该偏好与阈值收据。

## 5. PRISM-games：属性条件化的对抗与概率策略综合

### 5.1 官方材料确认的机制

PRISM-games 支持回合制和并发随机多人博弈，并以 rPATL 扩展表达概率、奖励、多目标与均衡属性。[PRISM-games 官方主页](https://www.prismmodelchecker.org/games/)

在回合制随机博弈中，每个状态由指定玩家控制；策略综合针对给定属性进行，而不是抽取一个与所有未来目标无关的通用“好策略”。[PRISM-games Modelling Language](https://www.prismmodelchecker.org/games/modelling.php)

工具可以导出策略，并把策略与原博弈做 product，从而固定该玩家的选择，再验证其它属性。这是“候选策略生成后独立回代验证”的成熟做法。[PRISM-games Strategy Synthesis Instructions](https://www.prismmodelchecker.org/games/instructions.php)

PRISM-games 2.0 明确支持多目标策略综合与 Pareto set computation，而非必须先把所有目标压成一个加权标量。[PRISM-games 2.0 官方论文入口](https://www.prismmodelchecker.org/bibitem.php?key=KPW16)

PRISM-games 的官方出版物列表还记录了 bounded value iteration 对随机博弈进行可靠上下界求解的实现。[PRISM-games Publications，PTHH20](https://www.prismmodelchecker.org/games/publ.php)

但 PRISM 主手册也明确指出，多数数值模型检查使用浮点迭代并按用户精度停止；exact arithmetic 只支持部分模型且规模受限。[PRISM，Iterative Numerical Methods](https://www.prismmodelchecker.org/manual/ConfiguringPRISM/IterativeNumericalMethods) [PRISM，Exact and Statistical Model Checking](https://www.prismmodelchecker.org/manual/ConfiguringPRISM/AllOnOnePage)

### 5.2 可借鉴机制

- 搜索图必须原生区分 `MAX/我方`、`MIN/对手` 和 `CHANCE/骰子` 节点，不能把对手动作当成我方候选，把骰子当成可选代表点。
- “有效策略”必须相对于显式 property/objective basis 定义。刺杀、场景胜利、领袖生存、分差、兵力、资源和位置选择权若都重要，应保存 Pareto 前沿或阈值可达集合。
- 一条策略的证据应包含把策略固定回完整博弈后的再验证结果，而不是只保存生成器内部评分。
- 概率分支必须保存下界、上界和未闭合质量。只报一个点估计不能支持完备性。

### 5.3 不能照搬之处

- PRISM-games 默认假设输入的有限状态与转移模型已经正确。它不会替我们证明 Warmachine 动作枚举、连续几何、规则交互和历史状态完整。
- 数值 value iteration 的收敛阈值不自动等于严格数学证书。要么使用有上下界的算法，要么在报告中保留数值误差区间。
- 一个属性下的最优策略不保证保留另一个未声明属性下的有效策略。目标基发生变化时，策略商必须重新验证或细化。

## 6. Storm：从粗过近似开始，结论不成立就精化

### 6.1 官方材料确认的机制

Storm 是成熟开源概率模型检查器，支持 reachability、reward、conditional probability 和 multi-objective analysis。[Storm 官方主页](https://www.stormchecker.org/)

Storm 的 abstraction-refinement engine 从具体模型的粗过近似开始。分析抽象后，若结果能传回具体模型则返回答案，否则继续精化，直到得到确定结论。官方同时明确该引擎目前只支持离散时间与 reachability 目标。[Storm，Engines](https://www.stormchecker.org/documentation/background/engines.html)

Storm 的 exploration engine 则按对结果贡献在线探索部分状态，官方把它定位在大但有限、低目标精度和 reachability 场景，不把少量探索结果表述成完整模型证明。[Storm，Engines](https://www.stormchecker.org/documentation/background/engines.html)

Storm 多目标属性支持询问阈值是否可同时达到，也可以返回 Pareto curve。[Storm，Properties](https://www.stormchecker.org/documentation/background/properties.html)

### 6.2 可借鉴机制

反向目标回归应产生一个保守过近似：允许暂时包含伪分支，但不能遗漏真实有效分支。正向 strict 执行发现伪分支后，以 reject 原因或反例细分抽象单元。

每次精化必须减少一个明确的抽象不确定性，例如：

- LOS/射程/底盘碰撞谓词在同一单元中不恒定；
- 对手在被合并状态中拥有不同回应集合；
- Chance 分布或伤害状态不同；
- 历史、回合窗口、资源或触发资格不同；
- 同一动作标签在 Host 中产生不同后继策略类别。

只有当结论能从抽象传回具体规则系统时，才可把该单元从 unresolved 改成 proven。

### 6.3 不能照搬之处

- Storm 的现成抽象精化范围与 Warmachine 全规则随机博弈并不相同，不能把其 reachability engine 当成可直接接入的通用求解器。
- 粗过近似通常适合证明安全或界；要保存全部 Pareto 非支配策略，还需额外保存策略见证与支配关系。
- 过近似可能制造具体系统不存在的对手能力或路线，因此必须依靠 Host strict 具体化和精化，不能直接把抽象胜率当真实胜率。

## 7. UPPAAL Stratego/Tiga：先综合许可式安全策略，再在其中优化

### 7.1 官方材料确认的机制

UPPAAL 的 controller synthesis 在 timed game 上区分 controllable 与 uncontrollable 动作。`control` 查询要求策略在对手/环境任意选择下满足目标。[UPPAAL，Controller Synthesis](https://docs.uppaal.org/language-reference/query-syntax/controller_synthesis/)

其官方文档对 `control: A[] safe` 的解释尤其重要：结果是 permissive strategy，可在同一状态保留多个安全动作，可理解为所有满足安全谓词策略的并集。它不自带进度概念，也可能包含无限循环。[UPPAAL，Controller Synthesis](https://docs.uppaal.org/language-reference/query-syntax/controller_synthesis/)

UPPAAL Stratego 的官方案例先用符号博弈综合在最坏对手下安全的控制器，再在该安全策略约束下使用统计学习优化距离/时间。案例明确把“安全”与“快”分为两个层次。[UPPAAL Stratego，Safe and Optimal Cruise Control](https://uppaal.org/casestudies/stratego/)

UPPAAL 还明确区分：

- symbolic query 对应数学上严格的符号语义；
- statistical query 来自有限次具体模拟，是可变化的统计估计；
- learning query 在只观察部分状态时可以更快、更简单，但官方明确说不保证收敛到最优策略；连续特征使用在线分区精化。[UPPAAL，Symbolic Queries](https://docs.uppaal.org/language-reference/query-syntax/symbolic_queries/) [UPPAAL，Statistical Queries](https://docs.uppaal.org/language-reference/query-syntax/statistical_queries/) [UPPAAL，Learning Queries](https://docs.uppaal.org/language-reference/query-syntax/learning_queries/)

近似控制还要求用户分区覆盖全部状态变量；官方警告排除有安全影响的状态变量可能产生无效策略。[UPPAAL，Approximate Controller Synthesis](https://docs.uppaal.org/language-reference/query-syntax/controller_synthesis/)

### 7.2 可借鉴机制

这是与本项目“有限策略商”最接近的成熟产品模式：

1. 先得到目标与规则条件下的 permissive strategy envelope，保留所有尚可能有效的动作；
2. 再在该 envelope 内按胜率、分差、资源或风险优化；
3. 学习和启发式只负责在已证明安全/完备的许可集合中选优；
4. 若为了学习省略观测字段，必须将其标记为近似并通过反例细化恢复。

对 Warmachine，这意味着“合法且仍可能进入某个 Pareto 非支配结果”的动作集合应先作为策略商保留，LLM/skill/ranker 只在这个集合内排序，不能反过来用 ranker 定义完整性。

### 7.3 不能照搬之处

- UPPAAL 的 timed automata、时钟 zone 和用户给定 cell partition 与多模型桌面几何不同。
- permissive safety strategy 只保证指定 safety property，不保证包含所有进攻、得分、交换和长线资源目标下的有效策略。
- 统计学习得到的是性能候选，不是最优性或完整性证明。其结果必须与符号证书分栏报告。

## 8. PioSOLVER：有限树内接近均衡，不代表原始连续动作完整

### 8.1 官方材料确认的机制

PioSOLVER 是商业 heads-up Hold'em 求解器。用户在开算前必须给定双方范围、底池、筹码以及允许的 bet/raise sizes；树构建器还允许添加、移除或强制特定 betting lines。[PioSOLVER，Technical Details](https://piosolver.com/docs/technical_details/) [PioSOLVER，Postflop Tree Building](https://piosolver.com/docs/viewer/postflop_tree_building/)

PioSOLVER 用 exploitability per hand 表达解的质量：假设完美对手知道当前策略并采用最佳反策略，还能额外赢多少。树可以保存并继续求解以降低 exploitability。[PioSOLVER，Technical Details](https://piosolver.com/docs/technical_details/)

官方声明 river 求解不使用牌面 bucketing/card abstraction，因而保留 blocker 细节。但同一文档和树构建文档也清楚表明，允许的下注尺寸与 betting lines 仍由用户先定义。其“无抽象”声明不能外推为覆盖 No-Limit Hold'em 的所有连续下注尺寸。[PioSOLVER，Technical Details](https://piosolver.com/docs/technical_details/) [PioSOLVER，UPI Commands](https://piosolver.com/docs/upi/commands/)

### 8.2 可借鉴机制

- 每个求解报告必须绑定精确的 action-tree contract。树内 exploitability 不能与树外动作混用。
- 用最佳对手反应评估策略，而不是只做双方合作式路线。
- 可恢复求解应保存相同树合同、精度目标和当前 exploitability；更换动作集后是新的求解问题，不是同一次确定性续跑。

### 8.3 不能照搬之处

- exploitability 只对已建有限树有意义。若漏掉一个 Warmachine charge lane、buff 前缀、反应窗口或连续位置单元，低 exploitability 不能证明原游戏低可剥削。
- PioSOLVER 面向两人零和且规则结构固定；Warmachine 还包含场景分数、非标量策略目标和复杂动作合法性。
- CFR 类迭代的低 exploitability 是近似均衡质量，不是“所有有效策略类别都被枚举”的证明。

## 9. GTO Wizard：动作子集重求解能量化删动作损失，但不是安全剪枝

### 9.1 官方材料确认的机制

GTO Wizard 官方文章直接说明 No-Limit Hold'em 必须通过限制下注尺寸、bucketing 和 betting caps 等方式抽象，传统求解器只在人工给定的有限下注树上计算近似解。[GTO Wizard，Poker Subsets and Abstractions](https://blog.gtowizard.com/poker-subsets-and-abstractions/)

产品用 Nash distance 衡量当前解被最佳反应利用时的最大 EV 损失，并公开预解和自定义解的大致精度阈值。[GTO Wizard，AI Benchmarks](https://blog.gtowizard.com/gto-wizard-ai-benchmarks/) [GTO Wizard，Understanding Nash Distance](https://blog.gtowizard.com/understanding-nash-distance/)

Dynamic Sizing 会从预定义下注尺寸中选择动作子集。新版方法构建并重求解不同动作子树，比较相对全树的 EV 损失，再选损失最小的子集；旧版还使用 frequency、EV 和 removal regret 特征指导迭代删除。[GTO Wizard，Dynamic Sizing 2.0](https://blog.gtowizard.com/introducing_dynamic_sizing_2/) [GTO Wizard，Dynamic Sizing](https://blog.gtowizard.com/dynamic-sizing-a-gto-breakthrough/)

官方同时承认完美精度并未达到，实际解按 exploitability threshold 停止；过度简化游戏树会造成求解器利用树限制产生的人工失真。[GTO Wizard，Understanding Nash Distance](https://blog.gtowizard.com/understanding-nash-distance/)

### 9.2 可借鉴机制

对一个候选动作类别是否可删，可以做比“它很少被选择”更强的实验：

1. 在包含该动作的较完整局部树中求一个下界策略；
2. 删除该动作后重新闭合对手最佳反应与 Chance；
3. 计算目标向量前沿的退化，而不只看该动作当前频率；
4. 若退化超过阈值，恢复动作并细分它为何有效；
5. 把 removal regret 作为反例调度信号，而不是安全证书。

这适合帮助发现反向包络遗漏的优解，尤其适合正向 complement challenge 队列。

### 9.3 不能照搬之处

- GTO Wizard 的动作候选列表仍是预定义有限集合。未进入列表的尺寸没有被证明无价值。
- 专有机器学习对动作价值的近似不能成为 admissible upper bound。
- “删除后 EV 几乎不降”只对当前树、范围、筹码、目标和求解误差成立；规则、地图、军表或目标基变化后必须重算。

## 10. Stockfish：强启发式搜索不能提供完整策略商

### 10.1 官方材料确认的机制

Stockfish 是成熟开源国际象棋引擎。其当前 `search.cpp` 同时包含 mate distance pruning、razoring、futility pruning、带 verification search 的 null move pruning、late move reductions、transposition-table cutoff 等选择性搜索技术。[Stockfish，search.cpp](https://github.com/official-stockfish/Stockfish/blob/master/src/search.cpp)

官方术语文档把 late move pruning 描述为在 move ordering 后剪掉较晚的安静着，把 LMR 描述为对预计较差的动作先以较低深度搜索；也说明 root depth 与实际搜索最深线路没有简单对应关系。[Stockfish，Terminology](https://official-stockfish.github.io/docs/stockfish-wiki/Terminology.html)

Stockfish 的改动由 Fishtest 分布式对局测试。官方仓库说明服务器用 SPRT、Elo 等统计量判断补丁是否增强棋力，达到统计显著时停止测试。[Fishtest 官方仓库](https://github.com/official-stockfish/fishtest)

这套流程证明的是版本在给定对局分布与时间控制下的经验强度，不是每个被剪分支都存在不可优于当前主变的形式化证书。Stockfish 源码中的 verification search 也只保护某些具体启发式条件，不能外推成全局完备性。

### 10.2 可借鉴机制

- move ordering、历史统计、神经网络、LLM 与 skill 非常适合作为搜索调度器，让高希望分支更早产生 incumbent。
- 某些高风险启发式剪枝可以配一个更深或更严格的 verification search，发现反例后撤销剪枝。
- 每一项启发式变化应进行大规模回归对抗，测量实际胜率、搜索节点与遗漏类型。

### 10.3 不能照搬之处

- Fishtest 通过不能说明所有战术分支都保留，只说明统计上没有检测到棋力退化或检测到提升。
- 固定时间下的最佳着不是穷尽全局策略树的证明。MultiPV 也只是返回若干主变，不是完整策略类别集合。
- 因此 Stockfish 风格的 pruning 只能进入本项目的 `heuristic_deprioritized` 或 `forward_challenge` 层，不能进入“完备策略商”的 hard-prune 层。

## 11. 对 Warmachine 方案的直接设计结论

### 11.1 必须区分两个有限商

**规则行为商 `Q_rule`**

- 目标：把连续几何、路径、模型状态和规则交互变成有限但 transition-stable 的规则状态；
- 等价条件：同一类中的状态暴露相同合法动作族，并在我方、对手和 Chance 下进入相同后继类别及概率分布；
- 作用：保证 strict 执行与合法性不丢；
- 局限：它可能仍然非常大，也不会自动删除战术上无效的空间。

**目标条件化策略商 `Q_goal`**

- 输入：固定 ruleset、军表、地图/部署、时域、信息结构、胜利根与目标向量；
- 目标：在 `Q_rule` 上合并策略等价类，删除有证书的被支配类，同时保留全部 Pareto 非支配策略类；
- 等价条件：必须由同一个对称关系满足目标与转移保持的概率交替双模拟；两个方向分别存在单向模拟仍不足以合并，更不能用坐标相近、动作名字相同或 ranker 分数相近代替；
- 作用：真正把完整空间缩成有限、可解释的策略空间。

如果允许任意未来目标，任何激进策略剪枝都无法证明安全。此时只能保留较细的 `Q_rule`。所以 `Q_goal` 必须绑定一个明确且可版本化的 objective-basis receipt。

### 11.2 反向搜索的正确角色

反向搜索不能只输出“已找到的好路线集合”，因为那是欠近似。它必须输出：

```text
所有可能达到目标或仍可能成为 Pareto 非支配解的状态/义务的过近似包络
```

反向 predecessor 的必要条件可以安全删除明确不满足条件的空间，但必要条件本身必须完整。例如刺杀包络不能只包含当前已知攻击者，还要覆盖：

- 所有能生成合法攻击、伤害、位移、资源或触发链的规则机制；
- 对手可能阻止或改变该链条的回应；
- 骰子全部概率质量；
- 位置、路径、激活次序、历史和状态恢复的完整前像类别；
- 同时存在的场景得分、反刺杀、交换和后续回合价值。

若某种机制尚未接入 predecessor，它对应的空间必须进入 `unresolved/complement`，不能默认为无效。

### 11.3 安全剪枝证书

每个从 `Q_goal` 删除的类必须归入且仅归入以下一种处置：

| 处置 | 必须保存的证书 |
| --- | --- |
| 不可达 | 完整前像/正向可达集合不相交证明，或 strict 规则不可行证明 |
| 行为等价合并 | 双向 transition-stable 模拟，含 MAX/MIN/CHANCE 后继与历史签名 |
| 被支配 | 目标向量不优，且对抗量词正确的 alternating-simulation witness |
| 上界剪枝 | admissible optimistic upper set 被当前可实现 Pareto lower frontier 完全支配 |
| 对称折叠 | 对称变换保持规则、地图、身份、概率、目标与后继，并可重建具体策略 |
| 未决 | 无证书，不删除，进入 complement challenge |

对 `s <= t` 表示“状态 `t` 对我方不差于 `s`”时，至少需要满足：

- MAX 节点：`s` 的每个我方动作，在 `t` 中都有一个不差的对应动作；
- MIN 节点：`t` 中对手的每个动作，在 `s` 中都有对应动作，保证 `t` 没有给对手新增更坏选择；
- CHANCE 节点：两个概率分布之间存在保持支配关系的 probability lifting/coupling；
- terminal/reward：目标向量逐分量不差，或上界集合被证明包含；
- timing/history/information：影响未来动作资格的签名兼容。

等价合并必须由概率交替双模拟直接证明。单向支配只允许删除被支配类，并必须保存从被删具体策略到保留策略的重建映射。

### 11.4 正向搜索的正确角色

正向搜索承担两个不同任务：

1. `materialization`：从合法开局 strict 执行反向包络中的候选，排除伪前像并生成可实现 lower witness；
2. `complement challenge`：独立探索反向包络以外但尚无排除证书的空间，优先选择 optimistic upper bound 高、模型不确定性高或 removal regret 高的分支。

第二项不能省略，也不能只在反向候选内部运行。否则“先反再正”只会让反向假设自证，无法发现被反向生成器漏掉的优解。

正向反例发现更好路线后，应执行 CEGAR 式精化：

- 找出反向必要条件、状态分区或动作机制覆盖中遗漏的谓词；
- 扩大反向包络或拆分策略类；
- 使旧剪枝证书按依赖失效；
- 重算受影响的 Pareto frontier 和 gap。

正向搜索没有找到反例，只能增加经验信心，不能单独把 unresolved 变成 proven pruned。

## 12. “包含全部有效策略商”的完成判据

要对一个具体 Warmachine 查询作出该声明，报告必须同时绑定：

1. ruleset/Host receipt、卡牌数据与原子规则版本；
2. 双方完整军表、配装、附件与合法性；
3. 地图、场景、部署、先后手与信息结构；
4. 时域或可证明终止条件；
5. 完整胜利根集合，包括刺杀、场景得分及特殊胜利；
6. 目标向量与 Pareto/阈值语义；
7. `Q_rule` 的全域覆盖与 transition-stability 证明；
8. `Q_goal` 的 retained/merged/dominated/unreachable/bound-pruned/unresolved 全分母账；
9. 每个 hard-pruned 类的可复核证书；
10. 我方、对手、Chance 的闭合分母与概率质量守恒；
11. 所有保留代表的 concrete strategy reconstruction 与 strict replay；
12. 独立 complement challenge 的范围、预算和发现的反例；
13. 数值误差、概率区间、Pareto gap 与剩余 unresolved 数量。

声明级别应分开：

| 级别 | 可作出的声明 |
| --- | --- |
| L0 路线见证 | 至少存在一条 strict 可执行路线 |
| L1 反向候选包络 | 已覆盖当前机制清单下的目标前像，仍可能遗漏机制 |
| L2 有界策略结果 | 给出 incumbent/Pareto lower frontier 与未决 optimistic upper bound/gap |
| L3 查询内完备策略商 | `unresolved=0`，所有删除有证书，所有量词与概率闭合 |
| L4 新目标/新规则稳健 | 只有目标基和规则依赖未变化时可沿用；变化后重新验证 |

只有 L3 才能说“在本查询合同内包含全部有效策略商”。即使达到 L3，也不能外推为整个种族、所有地图、所有军表或无限时域的全局最优。

## 13. 推荐的实现顺序

1. 先完成 `Q_rule`：严格动作域、连续几何 cell、路径拓扑、历史与概率 transition stability。
2. 建一个有限 Warmachine 微型博弈，实作 MAX/MIN/CHANCE alternating simulation、互等价商和 Pareto 支配证书。
3. 给每个节点增加 lower witness、optimistic upper set、gap 与处置账。
4. 让反向搜索生成过近似目标包络，并把未覆盖机制显式送入 complement，而非静默删除。
5. 增加独立正向 complement challenge 与反例驱动精化。
6. 最后才允许 LLM、skill、ranker、历史频率和学习模型做节点排序；其输出不进入 hard-prune 证书。
7. 在固定 Sepsira 六队 Mechanithrall Swarm 对 Fane 的基准上，先证明一个有限时域、有限目标基、有限地图单元的 L3，再逐步扩大查询合同。

## 14. 最终判断

商业优化器证明了“大量剪枝并不要求遍历每个具体解”，但前提是每片被删空间都有合法 bound 或可行域保持证明。模型检查器证明了“目标条件化、对手量词、概率与抽象精化”可以形成严格策略综合。扑克求解器和 Stockfish 则共同说明，强经验结果、低 exploitability、启发式动作缩减和大规模回归都不能自动升级为完整策略商。

因此，本项目的优先商方案在理论上可以有效，但必须满足以下硬边界：

> `Q_rule` 提供完整规则语义；反向搜索提供潜在有效策略的过近似；`Q_goal` 只凭 alternating simulation、合法上界、不可达或对称证书删除类别；正向搜索独立挑战未决补集；全部未决清零后，才在固定查询合同内宣称保留了全部有效策略商。

如果实现仍存在任何“没生成、没搜到、ranker 低分，所以删掉”的分支，最终产物就只是高质量候选集，不是完备策略商。
