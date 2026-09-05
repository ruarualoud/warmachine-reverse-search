# Warmachine 自定义对抗分析研发地图

Label: wayfinder:map

## GitHub management status

- Canonical tracker: the `23` numbered Markdown tickets under `issues/` plus this dependency map.
- Current denominator: `14` resolved/closed tickets and `9` open tickets.
- Git boundary: this tracker belongs only to the independent `warmachine-reverse-search` repository; Engine implementation and proof changes belong to `warmachine-strict-engine` and are linked through receipts rather than copied here.
- Publication boundary: repository history is authoritative for the current ticket text and status. GitHub web Issues are an optional projection and must never become a second, divergent ticket source.

## 2026-09-05 原理优化复核

逐工单待办见[23项优化审计](../../docs/research/ticket-search-principles-audit-20260905.md)，不增加Ticket分母、不作废历史验收范围。开发顺序更新为：先Cryx→Dusk→Convergence；随后交错推进20a参数债务、21a局部区间、22局部精化与09/10证据展示；任务域完整声明仍须20/22/21b闭合。12增量依赖贯穿开发，其它族和全产品总门保留开放。任务级分阶段放行收据尚未实现，现有隔离门不因本文修改而解除。

## Destination

完成一个可由玩家自定义阵营、领袖、固定核心、可替换槽位、配装、Steamroller 场景、地图与搜索预算的对抗分析系统。系统从有限且公开的胜利场景需求组出发，生成目标驱动的合法军表与后续回合终局根，反推到合法部署并由 rules-v1 Host 严格正向认证，再把每个初始状态的值区间、可达路线、拒绝、未解析与预算延迟做成可实时操作的中文报告。

初始状态值必须建立在 Host 派生的完整激活候选域、可证明的连续几何行为商、目标条件化的完整策略商、整轮对手回应和守恒 Chance 质量之上。发现一条双方合作的 strict 路线只证明可达性；它不能替代策略动作域或对抗闭包。

首个验收题为 `100` 分 Master Necrosurgeon Sepsira、六队 Mechanithrall Swarm 与六个 Warden 的 Cryx 核心，对 Fane of Nyrro 四名领袖及不同合法军表、地图和部署的对抗分析。完成后同一入口必须支持其它阵营和独有机制，不以固定题特化代替通用能力。

## Notes

- 本地图覆盖实现、验证、报告和完成门禁；不是只做规划。
- 独立反向搜索项目提供终局语料、反向前沿、外存 DAG、概率/对手账和 strict replay；本项目不得复制第二套搜索基础设施。
- Project D rules-v1 Host 与 Force Builder 是动作、规则、随机、反应、配装、军表和部署合法性的唯一真值。搜索侧只提出状态、路线和预算，不得用文本匹配或评分产生规则裁决。
- 构筑筛选分数只负责安排有限候选处理顺序。未闭合初始状态保持 `[0,1]`；代表频次不是自然概率；报告不得宣称自然胜率、全局最优、阵营最优或“未发现即不可达”。
- Host strict 拒绝必须保存相关动作、规则键、标记和最小必要上下文；输入错误、候选关系失败、规则未知和预算延迟必须分别记账。
- 新卡、规则原子、场景或数据更新必须按复合收据使受影响军表池、终局根、反向路径、值与报告失效重建。

## Decisions so far

- [建立目标需求分组与合法军表路由基线](issues/01-goal-conditioned-roster-routing-baseline.md) — 已把有限终局代表归并为详细需求组与可复用构筑宏型，并为固定 Cryx/Fane 题生成 Force Builder 合法军表池和逐组候选路由；这些分数只排序，不证明路径或胜率。
- [闭合首个真实军表终局根与拒绝回放](issues/02-first-real-matchup-terminal-root.md) — 已用完整 `100/100` Sepsira/Hysene 军表物化并独立重放一个真实第二回合刺杀根，拒绝与生命周期选择可复盘，但尚未证明从部署可达。
- [打通全阵营自定义任务与精确配装构筑](issues/03-generic-custom-task-and-force-builder.md) — 已由正式 Force Builder 为任意阵营、固定核心、逐副本配装、附件、战斗群与固定完整军表生成内容绑定的有限合法池，并逐类保留拒绝、遗漏、去重和预算质量。
- [建立搜索暴露规则缺口的回流修复门](issues/04-host-rule-gap-feedback-loop.md) — 搜索侧规则未知现可按来源、Host、原子和交互闭包回流；Rampant Fury 与 Feast/Frenzy 的真实缺口已在 Host 修复并使旧证据定向失效重建。
- [批量物化刺杀与得分需求组终局根](issues/05-batched-terminal-root-materialization.md) — 已完成有限、可恢复且质量守恒的四族生产调度。当前 `64` 项中 `51` 项完成，包含 `13` 个任务专属 strict 根、`4` 个 Host 拒绝、`28` 个关系过滤和 `6` 个官方规则结果未决；其余 `13` 个未实现刺杀分区保持预算延迟并保留在值上界。全部 `39` 个唯一开局通过 strict 部署，不产生胜率或最优性结论。
- [将真实刺杀终局根反推到合法开局](issues/06-assassination-root-to-opening.md)（完成）— 78 模型 Two Fronts 短路线从 `0:0` 合法部署反推并独立 strict replay 到 Vordak 刺杀终局；两方首回合各 `17/17` 个激活组闭合。组合预检在完整搜索前验证移动、资源、跨回合激活恢复和整轮连接，`402` 个未展开分支继续保留为 unresolved。
- [将真实得分终局根反推到合法开局](issues/07-score-root-to-opening.md)（完成）— round-3 Two Fronts 得分终局经四个历史回合边界反推到 `0:0` 合法开局；唯一验收路线含 `96` 条反向边并通过完整 strict replay。恢复前后语义结果一致，`1248` 个 unresolved 与 `20` 个 rejected 分支完整保留，因此只证明路线存在，不产生胜率或最优性结论。
- [计算概率对抗闭包与初始状态值区间](issues/08-adversarial-probability-initial-values.md)（完成）— 精确 Chance 质量、对手 `AND/min`、我方 `OR/max` 和七项闭包门现统一投影到逐格初始值；相同 strict state 共享计算但保留全部地址与路线标签。Ticket 06/07 已接入，当前因候选/回应/Chance 未闭合而诚实保持 `[0,1]`，无声明分布时不聚合自然胜率。

## Product and validation tickets

- [产出 Sepsira 六队 Swarm 对 Fane 的可论证报告](issues/09-sepsira-vs-fane-evidence-report.md)（开放）— 当前已归并 `6/8` 条真实路线单元；完整报告继续受候选域、策略商和多回合对抗闭包阻断。
- [建成可实时操作的自定义对抗控制台](issues/10-interactive-custom-matchup-console.md)（开放）— 已有回放与分支浏览基础，最终初始状态值、人工种子和完整策略分支仍需消费 Ticket 21 的闭包结果。
- [验证全阵营独有机制可被搜索调用](issues/11-all-faction-rule-mechanism-validation.md)（开放）— 需要在重认证 Engine 上逐机制证明构筑、动作、Chance、资源、生命周期和反向义务链，而不是依赖规则名出现。
- [建立规则与卡牌更新的增量重建流程](issues/12-incremental-rules-data-update.md)（开放）— 数据、语义、原语或 Engine 收据变化必须定向失效受影响的军表、终局根、路径、值与报告。
- [收口自定义对抗分析产品完成门禁](issues/13-product-completion-gates.md)（开放）— 聚合规则、搜索、值、报告、全阵营、增量更新和产品证据；上游任何未闭合质量都必须继续显示为未完成。

## Post-audit recovery tickets

- [闭合 Engine 全量严格验证分母](issues/14-engine-focused-verifier-closure.md)（完成）— Engine 八分片 `263/263` 在同一 `628` 文件闭包通过并发布唯一源码收据。
- [重建跨仓收据与干净克隆基线](issues/15-cross-repo-receipt-and-clean-clone-baseline.md)（完成）— 搜索结论绑定最终 Engine 与 `51` 文件 Search 执行闭包；`6/6` 干净基线不依赖历史 `.scratch` 或 `build` 工件。
- [保证终局候选分页与动作族完整](issues/16-terminal-candidate-completeness.md)（完成）— 候选块不跳槽位，移动后攻击与 LOS 证据一致，并枚举真实武器/法术 profile 而非固定取首项；Engine/Search 新收据及生产 `64/64 → 39/39` 严格开局均已复验。
- [保证严格拒绝与中断恢复等价](issues/17-replay-transition-recovery-atomicity.md)（完成）— strict reject 与成功提交前缀分账；三处 SIGKILL、单写者原子 checkpoint、真实 78 模型 primary/replay 逐 transition 恢复及生产 batch 均与一次性执行同结果。
- [建立有限且可证明的终局几何缩减](issues/18-lossless-terminal-geometry-reduction.md)（完成）— Host 必要条件预筛保留逐项排除证据，等价折叠绑定完整可观测关系；三类全量/折叠对照结果一致，存在性早停后的剩余候选保持未枚举与 `[0,1]`。
- [建立历史比分与几何绑定的胜利场景预设器](issues/19-history-bound-terminal-hypothesis-generator.md)（完成）— 历史预设现绑定终局类别、逐窗比分、完整得分来源和当时几何，并经当前 Host strict 双重重放后才允许分支附着。Ticket 06/07 真实路线已接入；旧 `4:0` 改写分别被提前胜利约束和 successor 状态比对拒绝。

## Game-tree completeness tickets

- [建立规则语义权威、原语重认证与可信 Strict 门禁](issues/23-rule-semantics-authority-and-strict-recertification.md)（进行中，`8/12`，最高优先级）— 已完成 23.0-23.7；当前23.8卡牌规则重认证，23.9关联证明、23.10统一运行链、23.11聚合认证待完成。先区分已重认证、仅缺独立证明、真实执行缺陷和确实未实现，再决定是否改代码。历史 Strict、skill、搜索值和线上实验保持隔离。
- [建立完整激活域与连续几何商空间](issues/20-complete-activation-and-continuous-geometry-domain.md)（进行中，完成门受 23 阻断）— 从 Host 枚举全部激活族，并以规则事件边界、路径拓扑和逐模型约束建立有证明的有限几何单元；固定比例移动只能作为代表，不得冒充完整连续域。
- [建立目标条件化的完整策略有限商](issues/22-goal-conditioned-strategy-quotient-completeness.md)（进行中）— 有限三法对照已用 `9` 个 strict 根保留 `6/6` 潜在有效类，较完整纯正向 `58` 根减少 `84.48%`，并由补集挑战找回纯反向漏掉的隐藏优解；下一步把该证明链绑定 Ticket 20 的真实规则行为商。
- [闭合多回合对抗选择与概率质量](issues/21-multiturn-adversarial-chance-closure.md)（待开始）— 消费 Ticket 20 的候选域、Ticket 22 的策略商和 Ticket 08 的值代数，按 OR/max、AND/min 与 Chance 守恒展开整轮行动并把未闭合质量投影到逐初始状态区间。

Tickets 08 与 19 已完成其值语义和历史预设职责，但规则权威前提需随当前Engine重新认证；旧工件保留为历史素材。最终完成仍须规则、动作域、策略商和对抗概率闭合。局部研究开发不必等待全游戏完整建图，具体采用上方2026-09-05分阶段安排；未枚举历史与策略质量继续保留为 unresolved 或 budget deferred，报告不得将路线存在性提升为胜率。

Ticket 09 地图纵切已完成：三类精确地形在数值拓扑审计后产生 `288/288` strict 代表开局，四名 Fane 领袖的地图、三部署和双先手缺口为零。路线报告已从硬编码两条升级为动态路线单元和值格归并；三条刺杀与 Ashmael 得分加入后当前为 `6/8`，只余 Auricant/Nymara 得分。因此 Ticket 09/10 继续 open，不能从已发现路线推导完整排名或自然胜率。

## Not yet specified

- 全量任务的生产预算、并发数与每个需求组的自适应停止阈值，要在首个刺杀/得分纵向路线和固定题批量测量后校准。
- 地图分布、部署分布与对局先后手若没有自然样本，只能逐格报告或使用用户声明权重；不能从代表生成频次推导自然胜率。
- 已认证路线怎样作为后续 MuZero/MCTS 课程、先验或训练样本消费，需在本地图完成后另开训练地图。
- Ticket 18 三类对照场景已测得严格 replay 代表数均缩减 `50%`；这是固定样本的验收事实，不是其它地图、军表或终局域的速度承诺。

## Out of scope

- 证明 Warmachine 连续状态空间、所有军表或所有未来规则版本下的全局最优解。
- 在本地图内训练或部署 MuZero/MCTS。
- 用 LLM、Skill、静态构筑分数或人工偏好修改 rules-v1 合法动作、概率或可达性。
- Route3 自弈、prompt-reply 与人机对战观察链路；它们消费本系统稳定产物后另行接入。
