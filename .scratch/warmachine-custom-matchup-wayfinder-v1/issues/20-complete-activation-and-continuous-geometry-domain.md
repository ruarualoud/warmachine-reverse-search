# 建立完整激活域与连续几何商空间

优化任务 `OPT-20` 已直接列于本工单的“开发补充”中；[原理审计](../../../docs/research/ticket-search-principles-audit-20260905.md) 仅保留依据与索引。`Blocked by` 表示最终完成依赖，历史验收范围不追溯改变。

Type: task
Status: open
Blocked by: 04, 15, 16, 18, 23
Part of: ../map.md

## 开发补充：OPT-20（2026-09-05）

以下为本工单剩余开发及新增验收，当前全部待实现/待验收，不因写入计划计完成。

- [ ] 20a：从Host输出当前窗口的决策方、可用离散选项、参数域、稳定游标和未闭合原因；复用既有response domain，而非把少数destination probes称为完整回应。
- [ ] 20a：按状态顺序兑现回应；前一个回应改变资格、资源、活模型或时点后重新查询下一窗口。只有依赖证明允许时，才能一次性展开独立选择的笛卡尔积。
- [ ] 20b：闭合声明任务的连续位置/路线、Unit联合攻击和激活顺序；有限见证、量化域穷尽、物理连续等价三个证书分别输出。
- [ ] 验收包含有/无合法decline、同一终点不同反应路径、回应后新增/消失选项、多个同窗选择顺序及随机结果之后才能决定的参数；缺任一轴时保持unresolved。
- [ ] 20a的研究接口可供21a先用保守区间，不能冒充20最终完成。原下方六项是20b的闭包路线；最终完成仍受23规则认证和全部传播义务约束。


Implementation design: `docs/continuous-action-domain-v1.md`

### 策略工作台接入补充（待开发）

范围及公式见[策略工作台合同](../../../docs/STRATEGY_WORKBENCH_SCOPE.md)，本节是实际开发清单，不改变历史完成范围。

- [ ] 支持以已校验当前局面为分析边界，保留逐模型伤害/系统、资源、持续效果、激活及待处理选择；必要历史缺失时给出缺项，不经normalize默认值伪造完整状态。同坐标不同窗口的合法集合须可区分。

## Question

怎样从当前 rules-v1 Host 为每个搜索状态建立完整、可恢复的合法激活候选域，并把连续位置与路径空间划分为有证明的行为等价单元，使历史反推不再把脚本指定的 `run`、固定距离比例或少数直线路径误当成完整动作空间？

## Acceptance

- 每个激活组和时序窗口都从 Host 枚举动作族、目标、武器/法术 profile、资源顺序和规则选择；覆盖放弃/瞄准、advance、run、charge、攻击、施法、Feat、特殊行动、额外攻击与反应，不以路线脚本白名单定义合法域。
- 连续终点由桌边、底盘碰撞、地形、LOS、射程、控制范围、单位编队、场景区域和规则触发边界构成有限事件单元；每个单元保存规则谓词签名、边界约束和等价证明，代表点只作为 strict 执行见证。只有采样而没有谓词闭包证明的区域保持 unresolved。
- 移动路径按底盘扫掠、障碍绕行同伦类、移动中触发与最终摆放关系区分；相同端点但规则可观察路径不同的候选不得合并。
- 多模型单位保留逐模型路径、单位连续性、附件关系、移动锚点和激活共同约束；只有经过完整 Host 可观察关系证明的维度才可因对称或独立性折叠。
- 候选游标逐槽封存为 strict accepted、strict rejected、proven excluded 或 unresolved；预算停止、连续域未细分和不支持的动作族都保留可恢复债务。玩家选择的坐标、路径和编队不是随机变量，不按面积、长度或采样频率写入 Chance 概率账本；真实骰子等随机结果另用精确概率账本守恒。
- 每个宣称完备的几何商空间都必须附有限商证明：所有 Host 可观察谓词在单元内部恒定，单元邻接/路径类完整，触发自动机状态有限；反例使单元继续细分，无法完成证明的部分进入连续域债务。
- 谓词恒定只是初始分区，不足以签发行为等价。分区必须继续精化到转移稳定：同一单元内的状态具有相同合法动作族，且每个玩家选择、对手回应和 Chance 结果到达相同的后继单元集合/概率分布；发现不同后继签名即拆分，不能用一个代表点外推整个单元。
- `Q_rule` 单元必须输出可供策略层绑定的初始分布、历史、观察、时序和可达上下文签名。未来 Host 行为相同只能证明规则行为等价；不可达单元不得仅因未来行为双模拟而代替声明开局中可达的策略单元。
- focused 场景至少覆盖 Leader 的部分距离 run、advance、charge、施法/Feat 顺序，Unit 绕障碍与编队，以及会跨越 LOS、控制、场景和反应边界的正反例。
- 固定 Nymara/Hysene 路线中的四个 `run` 前态只能作为四个已执行代表；在本门关闭前不得标记 `activationDomainComplete` 或 `continuousGeometryComplete`。
- 通过 `docs/research/strategy-quotient-search-experiment-v1.md` 暴露的不可达代表负例：相同未来行为、不同声明可达上下文必须保持策略层可区分。

## Completion Boundary

本工单证明声明搜索域的候选生成与连续空间账本完整，不计算多回合策略值。无法为任意规则证明有限等价划分时，正确结果是保留对应连续域债务为 unresolved，而不是宣称不可达、把连续选择伪造为概率质量，或任选离散步长代表全部。

## Remaining Implementation Order

1. 端点公式：已有凸约束交、严格内含障碍簇及凸良覆盖神经第一同调证书；继续处理接触、边界相交、带孔公式的多分量一般平面分解。
2. 路径拓扑：开放凸域已关闭；单个严格内含矩形障碍、固定对跖终点且上限排除额外绕圈时，顺/逆时针两类也已完整关闭。受支持凸事件区域已有来源绑定的有限成员自动机、精确 enter/exit 轨迹与已给轨迹复放；纯 fire/corrosion 同时进入已有语义后继收敛证明，伤害/移除/反应/未知同时组 fail-closed。若所有事件边界到起点的保守距离下界都大于完整移动上限，现可完整证明唯一可实现事件词为 `{epsilon}`。继续扩展可达边界的一般事件词及反应/外部钩子闭包，并扩展任意终点、多个绕圈/障碍的同伦类。拓扑证明、事件自动机与 strict 普遍执行证明继续分开签收据。
3. 参数化 strict 执行：空旷、无事件、单模型的 advance/run 已由 Engine 对全部 `0.01"` 量化合法终点签发普遍执行合同，Search 只验证合同、定理和绑定；下一步把该合同扩展到已经完成有限路径类/事件自动机证明的一般单元，仍不得从有限坐标样本外推。
4. Unit 联合几何：逐模型路径、碰撞、编队、附件、锚点及只在行为完全相同时可用的置换商。
5. 非移动连续参数与完整激活绑定：目标、模板、放置、推拉、法术/Feat/资源顺序逐槽关闭，保留 actorless 和强制窗口。
6. 转移固定点：按完整玩家 OR、对手 AND、真实 Chance 后继签名做 CEGAR 精化；零债务后才签发真实 `Q_rule`，随后进入 Ticket 22，再进入 Ticket 21。

## Current Evidence

- Engine `npm run verify:movement-geometry-predicate-plan`：来源绑定的 advance/run 谓词、三类地形几何、模型障碍、路径债务、输入顺序不变性和真实 strict advance。
- Engine `npm run verify:movement-geometry-endpoint`：由 Engine 自己对任意量化终点求值全部 Host 谓词与事件区域，覆盖矩形、圆、旋转圆角矩形、模型底盘边界、粗糙地形签名、无效输入和无 Chance 质量；该收据只分类终点，不声称路径可达。
- Search `npm run verify:geometry-predicate-plan`：Host 哈希/primitive 验证、历史上下文隔离和篡改拒绝。
- Search `npm run verify:geometry-cell-partition`：声明事件谓词签名的完整分页分母；几何非空、连通、路径类和转移稳定仍故意为 false。
- Search `npm run verify:geometry-strict-representative`：确定性关键点只作存在性探针；每个命中的签名必须重新由 Host 分类、取得 Host 路径提案、进入严格动作枚举并成功执行。可达粗糙地形正反两个签名得到 `2/2` strict 见证；把粗糙区移出移动范围后为 `1` 个见证加 `1` 个 unresolved，有限探针失败没有被改写为空集/不可达，也没有分配 Chance 质量。连通分量、路径类和转移稳定仍未关闭。
- Engine `npm run verify:movement-geometry-path` 与扩展后的 Search 严格代表门：Engine 对一条精确量化路径输出终点签名、精确路径哈希、分段成本、有序地形事件、首个阻挡、越界/碰撞和 precheck 收据；同终点直线/折线路径保持不同精确身份。同一 `(14,10)` 终点的“穿越粗糙地形”和“绕开粗糙地形”都由 Search 严格执行成功，终点签名相同，而路径签名及有序事件签名均为 `2` 类。精确路径身份当前用于防止误合并；同伦类分母、触发自动机和转移稳定仍为 false，不以已发现的两条路线冒充完整路径域。
- Search 转移反例纵切：每个严格见证同时封存去除临时显式路径目录后的后继语义状态哈希、完整事件轨迹哈希和有序事件类型，并生成 `transitionObservationHash`。同一 `(14,10)` 终点的穿越/绕行路线观察到 `2` 个转移签名，所在单元立即标记 `observed_transition_variation_requires_refinement`。不同签名是必须拆分的反例；有限见证签名相同仍不构成转移稳定或行为等价证明。公共语义状态哈希已从终局反推模块提取到独立状态工具，既有终局事件、移动反推、状态约束和历史概率回归全部通过。
- 反例驱动细分账本：同一粗布尔单元的全部已执行见证按转移观察签名分组，当前夹具实际得到 `6` 个已观察类，其中包含上述同终点 `2` 类；账本同时保留 `unresolved_unobserved_continuous_remainder`，不把有限样本组冒充完整几何子单元，也不分配 Chance 质量。事件序列或后继状态出现差异时会产出下一轮所需的细分轴。
- Search `npm run verify:complete-activation-domain`：新增 `complete-activation-domain-v2`，从 Host 当前窗口先取一次完整组枚举，再按与 Host family scope focused 对照通过的版本化分类合同分成 scenario/attack-or-effect/movement/resource/timing/special 六族；控制阶段的全局强制窗口保持一个不可拆槽。五类微场景的合法/拒绝集合与 Host 全量枚举完全一致，动作唯一归槽，演员组、actorless 动作、分页、完整页恢复、篡改拒绝和无 Chance 质量均通过。组槽外壳可闭合，但完整离散 parity、连续参数、Unit 联合几何、路径类和转移稳定继续为债务。
- 真实 `106` 模型 Sepsira/Fane 开局 canary：`17` 个激活组形成 `102/102` 槽，枚举出 `577` 个合法动作和 `7341` 个严格拒绝，全部唯一归槽；耗时 `507364 ms`，计划哈希 `62387183...`，收据 `b688eef1...`。本轮为避免重复执行未请求全状态一次性 Host parity，因此该项保持 `null`，`discreteSlotDenominatorComplete=false`；另保留 `33` 条连续域债务，`activationDomainComplete=false`。详见 `docs/research/complete-activation-domain-real-opening-canary-v1.md`。
- Search `npm run verify:geometry-cell-connectivity`：端点公式已有两类非采样连通性证明。非空凸约束交覆盖空桌 `1/1`；排除物先按严格相离或严格相交分类，相交图为森林时，凸集合良覆盖的神经为树、每簇可缩，再由平面补集连通性签发一个分量。当前粗糙区 inside/outside `2/2`、孤立障碍外部 `1/1`、双重叠障碍外部 `1/1` 通过；膨胀后仅接触、相交图成环和横跨工作域边界均为 `0` 签证。分页反例同时证明仅当前页可证不能升级为全签名分母完成。该证书只覆盖端点约束公式，不覆盖严格可达端点集合、路径类或转移稳定，因此总 `connectedComponentPartitionComplete` 仍为 false。
- Search `npm run verify:geometry-path-topology`：新增开放凸域路径定理。Host 精确声明仅有棋盘底盘内缩与移动距离圆、无障碍、无路径事件、无 wildcard 时，每个固定终点的全部合法路径均与直线段相对端点同伦，路径拓扑类精确为 `1`。粗糙地形、孤立障碍和 Unit 三类负例均保持 `0` 签证，篡改收据拒绝且无 Chance 质量。该收据明确保持 `strictUniversalActionExecutionComplete=false` 与 `transitionStable=false`；拓扑有限不冒充规则执行普遍性。Ticket 20 入口已加入 Search 执行收据闭包，当前闭包为 `72` 文件。
- Engine/Search 危险地形事件面实验：同一 `(14,10)` 终点的穿越酸池与绕开路线都 strict 接受，只有穿越路线产生 `continuous_effect_applied`/腐蚀。Host 现在按地形外形、演员底盘和触发距离声明 `movement_hazard_trigger_region`，输出有序进入收据并强制 `movement_hazard_path_partition_required`；Search 的规则行为观察保持 `2` 类。对照的粗糙地形两条路线虽有 `2` 个精确审计轨迹，但在仅含 `rough_terrain_move`/`move`/窗口审计事件且后继规则状态一致时可归为 `1` 个规则行为观察。该对照证明细分依据是规则效果，不是路径文本或审计噪声；旋转危险地形的精确进入顺序仍 fail-closed。
- Search 端点障碍神经实验：障碍簇不再只接受森林。逐对严格相交形成 Čech 神经一骨架，显式严格三重交集形成二单形，并在 `GF(2)` 上计算第一同调。三矩形两两成环但中央三重相交时，图环秩 `1` 被一个三角边界消去，`H1=0` 并签发单连通外部；三圆只两两相交、中央留孔时，圆心与两圆边界交点完备判定三重交集为空，精确 `H1=1`，由 Alexander 对偶证明端点公式恰有 `2` 个分量。数量证明与组件物化分开签收据；下条已关闭三圆窄域物化，通用分区仍保持 false。接触、边界跨越及未支持形状仍拒绝。
- 三圆环窄域组件物化：圆心三角形每条边都由对应严格重叠圆盘对覆盖，形成禁止穿越的 Jordan 环。外部组件绑定已接受 strict 路径，中央组件绑定严格满足端点公式的圆心质心，并证明从外部起点到中央必须穿越阻挡环。两组件在该窄域已完整物化；通用 `connectedComponentPartitionComplete` 仍为 false，因为混合形状、多孔和边界相交公式尚未关闭。
- Engine 参数化移动接口：`materializeRulesV1ParameterizedMovementAction()` 现在拥有内部路径注入、路径求值、严格枚举和哈希收据。Search strict representative 只提交路径并校验收据，不再直接构造 `explicitMovementPaths`。任意部分距离 advance/run 正例、阻挡/非法坐标/Unit 负例通过；该接口仍只证明一个精确量化动作，不是连续单元普遍合法性证明。
- Engine/Search 普遍执行纵切：`buildRulesV1ParameterizedMovementDomainContract()` 仅在单个存活非 Unit 模型、空地形/场景/规则/状态/事件表面、未激活，且谓词精确为棋盘底盘内缩与移动距离圆时签发定理。该定理覆盖满足谓词的全部 `0.01"` 量化终点，以直线路径 strict 执行 advance/run；Search 绑定 Host 谓词哈希、演员、动作族、定理和来源回执并拒绝篡改。粗糙地形、障碍、Unit、特规/状态、场景表面和已激活状态均 fail-closed。Engine 八分片 `268/268` 通过；该子门仍保持 `transitionStable=false`，不能关闭 Ticket 20。
- 固定终点障碍路径类纵切：单个矩形障碍严格内含于棋盘/allowance 凸域，演员和固定终点位于中心两侧。路径绕中心的角度提升只能是奇数倍 π，且路径长度至少为 `障碍内切半径 × |角度提升|`；当 Host 上限小于 `3π × 内切半径` 时，除顺/逆时针半圈外的所有类都被硬下界排除。水平、垂直、run 三组均得到 `2/2` strict 见证；直穿、长上限、非对跖端点、事件、多障碍和收据篡改均拒绝。该证明只绑定一个固定终点，不升级全端点障碍域或转移稳定。
- 有限移动事件自动机纵切：Engine 对受支持凸粗糙/危险区域给出精确边界区间、enter/exit 轨迹、初末成员关系、同时穿越分组与歧义拒绝。`0.01"` 正长度路径段和非折扣移动成本给出最大合法段数；每段对每个凸区域至多两个边界交点，因而成员 bitset × 已消耗穿越预算为有限自动机。Search 能复放重复进入/离开、拒绝伪造轨迹和边界端点，并在同时跨区时只合并成员关系、保留规则效果顺序债务。Engine 全矩阵 `268/268`、稳定来源闭包 `633` 文件，Search 主路径拓扑和 `74` 文件生产闭包通过。几何可实现事件词全集、反应、同时效果结算与转移稳定仍为 false，Ticket 保持 open。
- 几何危险区结算与同时纯状态收敛纵切：旧执行器虽能在路径收据中计算先后，却按 `state.terrain` 数组顺序执行；伤害需求也只看路径首尾。现已改为逐路径段按精确进入参数结算、逐段收集伤害需求，并由 advance 级 ledger 保证同一区域进入效果仅一次。纯 fire/corrosion 同时组仅以状态集合并的交换律/幂等性签发语义后继收敛，`ruleResolutionOrderProven` 仍为 false；同时伤害、移除、反应和未知效果 strict reject/pending。Search 校验嵌套效果收据与 crossing 绑定，拒绝伪造收敛结论，并把已给路径的声明事件效果闭合上卷到主 topology。Engine 新收据 `3ca4b0c5...` 在稳定 `633` 文件闭包下通过 `268/268`；Search 上游、事件自动机、路径拓扑、严格代表和 `74` 文件执行闭包通过。可实现事件词全集、反应/外部钩子和转移稳定仍为 false，Ticket 保持 open。
- 不可达事件边界完整语言纵切：Engine 为每个受支持事件区域签发起点成员关系、保守起点到边界距离下界及 rectifiable-path 长度定理。全部边界距离下界严格大于完整 movement allowance 时，任何合法路径都不可能 crossing；Search 再要求一个 strict 零 crossing Host 轨迹证明空词存在，因此完整分母精确为 `{epsilon}`、数量 `1`。远处 acid pool 正例、可达 pool 和缺失 strict witness 负例通过，主 topology 已接入。Engine 新收据 `6accb763...` 在稳定 `633` 文件闭包下通过 `268/268`，Search 生产闭包为 `75` 文件。可达边界事件词、反应/外部钩子、Unit 联合几何和转移稳定仍未关闭，Ticket 保持 open；规则集候选基线未提升。
