# Warmachine 连续动作域有限化设计 V1

## 目标

在固定 Host 收据、完整规则状态和有限时域下，把移动终点、路径和多模型编队这些连续玩家选择表示为可恢复的有限行为商空间。该商空间必须支持：

- 从终局公式反向求必要前像；
- 从精确合法开局 strict 正向执行；
- 玩家 OR、对手 AND 与真实 Chance 分支闭包；
- 预算停止时保留未解析连续域，而不是把采样失败升级为不可达。

本设计不使用固定网格或固定角度/距离代表作为完备性依据。

## 当前可复用能力

- `src/search/lazy-action-cursor-v1.mjs` 已能分页激活组、动作族、目标、profile、资源与部分移动目标维度。
- `src/reverse/spatial-quotient-v1.mjs` 已能证明棋盘自同构和行为相同 Unit 成员的标签置换，但没有一般连续事件单元。
- `src/reverse/terminal-geometry-reduction-v1.mjs` 已能做 Host 必要条件预筛和代表折叠，但只覆盖声明的有限终局候选。
- `src/search/cegar-v1.mjs` 已能把 strict reject 转成精化谓词，但作用域仍是精确状态/动作。
- Engine 的 `buildRulesV1MovementPathProposalPlan` 已有底盘碰撞、膨胀障碍和可见图路径提议，但只为指定终点返回少数路线，不证明终点域或路径类完整。
- Engine 普通 open-lane movement 仍使用固定方向和固定距离比例；Search 历史反推仍使用 `[1, 0.75, 0.5, 0.25]`。它们只能保留为 witness 提议。

## 核心对象

### GeometryPredicatePlan

每个动作上下文从 Host、原子注册表、交互图和反向目标义务提取有限谓词：

- board/deployment/scenario membership；
- swept-base collision 与合法最终摆放；
- LOS、遮挡和规则可见性；
- melee/ranged/spell/control/command/coherency 范围；
- trigger/reaction/timing eligibility；
- 会改变后继动作可用性或终局值的其它几何关系。

每个谓词必须记录来源规则键、参数、参与模型、边界构造器和 Host 收据。未知来源产生 wildcard debt，禁止对受影响区域 hard quotient。

### GeometryCell

一个单元保存：

```text
cellKey
constraintFormula
predicateSignature
boundaryRefs
adjacentCellKeys
representativeWitnesses
transitionSignature
proofStatus
proofReceiptHash
```

`representativeWitnesses` 只用于 strict 执行。`proofStatus=certified` 至少要求谓词恒定、邻接完整和转移稳定。

### PathClass

路径类保存：

```text
pathClassKey
startCellKey / endCellKey
obstacleTopologySignature
sweptBaseSignature
orderedTriggerSignature
eventAutomatonStateBefore / After
shortestRepresentativePath
proofStatus
```

同端点但绕障碍拓扑、沿途触发顺序或反应窗口不同的路径不能合并。

### ContinuousDomainLedger

连续选择不是 Chance。账本逐单元/路径类保存：

```text
strictAccepted
strictRejected
provenExcluded
unresolvedDomain
budgetDeferred
```

账本统计的是声明有限分区的覆盖，不赋予面积、长度或样本频率概率。骰子等随机结果继续使用独立精确 Chance 账本。

## 有限化算法

### 1. 目标条件化初始分区

只为当前演员、目标、相关阻挡物和有限时域义务生成事件面，不对整张桌面和所有模型一次性做全局 CAD。配置空间障碍按移动模型底盘半径膨胀；距离阈值、LOS 切线和场景边界共同形成初始单元。

### 2. 路径类生成

在膨胀障碍的可见图/路网中枚举不同拓扑和事件自动机签名。每个类别选择最短合法代表，因为不产生新规则事件的正长度循环只消耗移动；若规则观察路径长度、交叉顺序或中途位置，则对应事件必须进入签名，循环不能直接删除。

### 3. strict 代表执行

对每个候选单元和路径类，通过 Host 枚举精确动作并执行。代表失败只反驳该精确见证；只有独立边界证明才能排除整个单元。

### 4. 转移稳定分区精化

初始谓词相同不代表行为等价。对每个单元比较：

- 可用动作族、目标、profile 和资源顺序；
- 玩家选择与对手回应到达的后继单元集合；
- 每个真实 Chance outcome 的后继单元及精确概率。

同一单元出现不同签名时，使用差异谓词或 strict 反例继续拆分。迭代到固定点后才签发 transition-stable receipt。无法收敛或预算停止的部分保持 `unresolvedDomain`。

### 5. 多模型 Unit 因子化

Unit 使用约束图而不是坐标笛卡尔积：

- 节点为逐模型位置/路径变量；
- 边为底盘避碰、coherency、附件、锚点和共同激活约束；
- 逐模型放置并传播可行域，发现冲突立即回退；
- 只有完整行为指纹相同、没有身份引用且后继签名相同的成员才可做置换折叠。

## 正反向连接

反向层为每个剩余时域生成目标域 `B[h]`；正向层从精确合法开局生成完整状态 `F[t]`。连接条件为完整状态满足反向 Cell 的全部离散、几何、时间、资源和规则约束。

正向后继与 `B[h-1]` 无交集时：

- 有完整必要条件证明：`provenExcluded`；
- 仅代表不匹配或精化未完成：`unresolvedDomain`；
- 不允许因排序、LLM、Skill 或构筑评分而 hard reject。

## 模块边界

计划新增或升级：

1. `src/geometry/predicate-plan-v1.mjs`
   生成来源绑定的几何/规则谓词和事件面。
2. `src/geometry/cell-partition-v1.mjs`
   构建、细分和持久化约束单元与邻接。
3. `src/geometry/path-class-v1.mjs`
   枚举膨胀障碍拓扑、扫掠和事件自动机路径类。
4. `src/geometry/transition-stability-v1.mjs`
   比较动作/后继签名并签发有限商证明。
5. `src/search/complete-activation-domain-v2.mjs`
   把离散 lazy cursor 与连续 Cell/Path cursor 组成完整候选域。
6. `src/search/direction-feasibility-v2.mjs`
   区分 witness discovery、denominator closure 和 value-interval tightening 调度目标。

Engine 继续拥有几何与规则真值；Search 拥有符号分区、恢复、账本和调度。Search 不复制第二套碰撞、LOS 或动作合法性裁决。

## 分阶段验证

### Slice A: 单模型普通移动

- 空桌 SPD/Run 任意部分距离；
- 桌边和矩形阻挡地形；
- 同一终点不同绕行类别；
- 与穷举高分辨率探针做漏项诊断，但不把探针当证明。

### Slice B: 规则事件边界

- melee/ranged/spell/control/command/zone 阈值；
- LOS 模型/地形遮挡与 Stealth/True Sight；
- 反应和路径中触发的正反例。

### Slice C: Unit

- 逐模型路径、coherency、附件和锚点选择；
- 可交换与不可交换成员；
- 结束摆放可行但中途扫掠失败的反例。

### Slice D: 完整激活域

- advance/run/charge/aim/forfeit；
- 攻击、施法、Feat、特殊行动、额外攻击和反应顺序；
- 游标中断恢复和所有未展开槽位债务。

### Slice E: 搜索方向

- 同一微场景对照 fixed-start forward、symbolic backward、goal-guided forward 和 front-to-front；
- 刺杀与合取得分分别测量；
- witness 成本、闭合增量和值区间收缩分开报告。

## 完成门

Ticket 20 只有在以下条件全部成立时关闭：

- 声明时域内全部相关离散动作槽和连续单元均有处置；
- 每个 certified Cell 有谓词、邻接和转移稳定证明；
- 每个 certified PathClass 有完整拓扑/事件签名和 strict 代表；
- Unit 约束、路径扫掠和最终摆放通过 focused 正反例；
- 每个可能开放响应窗口的主动动作，都完整枚举并严格执行对手全部合法反应以及明确放弃；响应中的强制效果、外部钩子和 Chance 结果均有守恒账本；
- 联合近战/远程攻击按整次 Unit Combat Action 关闭：完整覆盖主攻者、武器档案、每个模型可贡献的攻击多重集、目标、冲锋攻击属性以及有序的多次联合攻击，而不只枚举一次攻击的协助者子集；
- 玩家 OR 与对手 AND 的所有后继都进入同一分区细化过程，任何未展开反应都会使 `opponentResponseDomainComplete`、`transitionStable` 和 `Q_rule` 保持 false；
- 预算停止与规则未知保持可恢复债务；
- 固定比例 run/open-lane 结果只作为代表证据，不再承担完整性声明。

Ticket 20 的完成只签发规则行为商 `Q_rule`。它不使用战术价值删分支，也不证明保留了全部有效策略；目标条件化支配、上下界剪枝和反向包络补集由 Ticket 22 独立证明。

## 当前实现检查点

- Slice A 已有 Host 谓词计划、终点/精确路径收据、严格存在见证、转移反例和保留未观察余集的 CEGAR 账本。
- Slice A 的连通性子门已关闭两个可证子类，并开始关闭多分量数量/物化：非空矩形/圆/旋转圆角矩形内部约束的有限交签发一个端点约束连通分量；严格内含凸排除物的 Čech 神经经 `GF(2)` 精确第一同调和 Alexander 对偶得到平面补集分量数。森林、双重重叠及三重交集填满的环为一个分量；仅两两相交的三圆环精确为两个分量，并以被圆盘并集覆盖的圆心 Jordan 三角形分别绑定外部 strict 代表和中央不可达代表。该窄域组件已物化，但通用 `connectedComponentPartitionComplete=false`；接触、横跨边界、混合形状和多孔一般式仍保持债务。该证明不外推到完整 strict 可达集合。
- Slice A 的首个路径拓扑子门已关闭开放凸域：Host 仅声明棋盘内缩与移动距离圆，且无障碍、路径事件和 wildcard 时，每个固定终点恰有一个相对端点同伦类，直线段是规范代表。粗糙地形、障碍和 Unit 均 fail closed。该结论与下一条 Engine 普遍执行合同组合后可证明此窄域全部量化动作可执行，但仍不证明精确审计事件或后继状态的转移稳定。
- Slice A 的首个障碍路径类参数族也已关闭：在凸外域中只有一个严格内含矩形障碍、演员和固定终点关于障碍中心对跖，且 Host allowance 小于 `3π × 障碍内切半径` 时，角度提升和长度下界证明全部合法路径恰分为顺/逆时针半圈两类。两类各有一条精确量化 Engine strict 见证；直穿、长上限、非对跖端点、事件面、多障碍和篡改均 fail closed。该收据只覆盖固定终点，不代表全端点或一般障碍域完成。
- Slice B 已关闭首个来源绑定有限事件自动机子门：Engine 按危险地形外形、演员底盘和触发距离构造精确圆/圆角旋转矩形 Minkowski 区域，并为受支持凸粗糙/危险区域输出 enter/exit 边界轨迹、初末成员关系和同时穿越分组。`0.01"` 正长度路径段、移动成本不小于几何长度、每条直线段至多穿越每个凸区域边界两次，给出有限状态上界；Search 可复放精确轨迹并拒绝伪造、端点边界和不支持几何。Strict 执行现按精确进入参数而不是地形数组顺序结算，并逐显式路径段收集伤害需求；同一区域每次 advance 只结算一次进入效果。纯 fire/corrosion 同时组只在 Host 签发状态集合并的交换律/幂等性收据时使用规范审计顺序，明确不声称规则给出该顺序；同时伤害、移除、反应及未知效果 fail-closed。若所有事件边界的保守起点距离下界都严格大于完整移动上限，rectifiable-path 长度定理和一条 strict 零 crossing 轨迹现可完整证明可实现事件词全集恰为 `{epsilon}`。可达边界的一般事件词、反应/外部钩子和转移稳定仍未关闭。
- 参数化 strict 执行已有三层 Engine 权威：单模型 API 负责任意精确量化 advance/run 的内部路径注入、枚举和执行；普遍域合同只在单个存活非 Unit 模型、空地形/场景/规则/状态/事件表面且未激活时，证明所有满足棋盘内缩与 allowance 的 `0.01"` 量化终点可沿直线 strict 执行；Unit API 则接受任意一个存活成员的精确路径，以及其余每个存活成员的完整最终摆放映射，并由 Engine 严格枚举/执行或拒绝。Search 校验全部合同哈希、演员/动作/Unit 成员分母和来源绑定。Engine 最新八分片为 `269/269`、`634` 个来源文件；一般连续单元、全部 Unit 动作族、反应和转移稳定保持未完成。
- 可达事件词不再只靠已发现路线：可恢复工作表遍历每个 Host 允许的 `0.01"` 终点和每个未被合法支配的量化路径前缀，以内容寻址路径 DAG 保存父节点，并在完整耗尽后签发静态几何事件词分母。Unit 因子只能关闭选中成员的路径；其余成员联合摆放由独立工作表把每条保留路径与完整棋盘点积组合，逐个交给 Engine Unit API。当前双成员微场景的 `advance` 分母为 `16` 个联合参数、`4` 接受、`12` 拒绝，并已覆盖两个可选移动成员。它仍不覆盖 run、charge/failed charge、特殊移动、真实大 Unit、对手反应或后继等价。
- Slice D 的离散外壳首段已由 `src/search/complete-activation-domain-v2.mjs` 实现：演员组×动作族槽位可分页、唯一归属、恢复和篡改拒绝；控制阶段全局强制窗口不被错误拆族。
- Engine 当前会为一次 CMA/CRA 枚举每个合法主攻者下全部非空协助者子集，并严格处理参与资格、射程/LOS、CRA 自动失手、近战中目标、巨大底盘例外及每个参与模型的命中/伤害加成。Search 离散外壳能收进这些现成动作，但这不是整次 Unit Combat Action 的完整参数域。新的显式债务 `unit_combined_attack_full_combat_action_partition_unresolved` 保留主攻者、武器档案、参与攻击多重集、目标、charge/non-charge 属性、多次联合攻击顺序、对手反应和 Chance；未关闭前不得签发激活域完整。
- 对手响应不再只是执行后才出现的意外失败。`opponent-response-domain-v2` 从 Host 投影每个非行动方需求，按 `opponent AND` 保留放弃、使用、有限目的地和伤害转移选项；可恢复工作表为每个组合签发严格后继或待处理处置。真实 Countercharge 动作有 `9` 个声明选项并全部严格执行。这个 `9/9` 只关闭当前声明的有限选项积：Countercharge/Admonition 的连续目的地、多个反应的合法优先顺序、反应攻击精确 Chance 分布和伤害转移复合动作仍分别保持 false。
- 当前真实 `106` 模型开局关闭 `102/102` 个演员组×动作族槽，但全状态 Host parity 本轮未请求，连续域仍有 `33` 条债务，因此完整离散域、连续域与激活域均保持 false。
- 后续顺序固定为：扩展 Unit 的 run、charge/failed charge 和特殊移动 → 覆盖真实 Unit 规模 → 关闭 CMA/CRA 整次 Combat Action 分区及其他非移动参数 → 对每个主动动作完整展开对手反应/放弃、强制效果、外部钩子和 Chance → 在玩家 OR/对手 AND 后继上求交替转移固定点 → 接入生产激活规划器。只有全部动作槽、反应槽和后继类关闭后才能签发 `Q_rule`；之后依次进入 Ticket 22 和 Ticket 21。
