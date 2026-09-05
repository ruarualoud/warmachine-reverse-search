# 开发任务恢复与执行说明

用途：恢复中断任务、领取下一批规则、修改搜索方案或开发策略指导入口时，先按本说明定位工作。本文管理执行方法；完成状态只维护在各ticket、TASKS及Engine固定来源账本。

## 1. 恢复位置

1. 分别确认Search与Engine的仓库根、分支、工作树和最近提交；当前协作分支为 `codex/post-audit-mainline-recovery`。存在他人改动时保留并核对归属，不从其它工作树拼装“最新代码”。
2. 读取本仓库 `PROJECT_MEMORY.md`、`TASKS.md`、[当前地图](../.scratch/warmachine-custom-matchup-wayfinder-v1/map.md)及当次ticket的开发补充。旧交接报告只作历史证据，GitHub web Issues不另做第二套状态源。
3. 规则批次另读Engine `TASKS.md`、本批精确来源和[规则原子规范](https://github.com/ruarualoud/warmachine-strict-engine/blob/codex/post-audit-mainline-recovery/docs/RULE_ATOM_DEVELOPMENT_STANDARD_V1.md)。Search通过Host使用规则，不复制规则实现。
4. 检查上次PID、源码内容指纹、命令、输出路径及checkpoint。只有同内容同参数的有效结果才能复用；缺失结果不记为通过，仍运行的同一门不重复启动。

完成条件：能明确说出本次ticket、一个交付范围、现有证据、未完成项与执行命令，而不是重新盘点所有历史记录。

## 2. 领取下一项

- 主线仍是Ticket23的 Cryx -> Dusk（含Fane of Nyrro）-> Convergence；先完成三族优先范围，再暂停其它族扩张并贯通搜索。计时对照样本不改变此顺序。
- 来源分母取Engine `data/function3-rules/warmachine-faction-priority-ledger-v40049.json`，日常只更新选中行及计数。数据版本变化或整族/最终收口再全量对账。
- 简单规则先做一条真实来源纵向烟雾，确认全部上下文与传播入口再组批。纯组合、接线、共享协议分别计时；同义source ID不算多个独立语义。具体证明要求以Engine规范为准。
- 三族后按[开发计划](DEVELOPMENT_PLAN.md)交错推进20a、21a、22与09/10；12的增量依赖贯穿。最终认证依赖不因提前写代码而解除。
- 当前用户要求单代理开发；先完成可验证功能，性能完全阻塞或重复验证可明确消除时才专项优化。没有新指令不恢复线上实验或旧skill。

完成条件：批次在现有ticket有待办和验收，新增需求归入对应开放ticket；范围外维护不追溯改写已完成ticket的历史验收。

## 3. 策略指导开发时

先读[工作台用途与缺口](STRATEGY_WORKBENCH_SCOPE.md)，区分军表对抗、当前局面建议和达到目标局面三种查询。输入状态、目标和时域是不同概念。

- 20负责Host动作/回应参数域；21负责双方适应性策略和概率展开；08复用值代数；22提供有证据的缩减；09/10负责解释与操作；12负责失效；13/23负责放行证据。
- 当前局面是已观测的起点，不是偷偷给反向测试的正向答案。新入口要保留旧终局种子的oracle隔离门，并分别记录来源。
- 每次建议绑定状态与规则哈希。棋盘改变后旧建议先失效，仅读取或展示不会自动执行对局动作。
- 策略优劣按选择时可获得的信息判断；事后骰子、未揭示对手计划不能进入当时的推荐输入。

完成条件：一个小场景从合法输入到候选、对手反制、概率/区间、中文可回放输出全链路通过。仅完成页面、schema或手算例子不算策略器可用。

## 4. 收口与提交

1. 先专项和受影响相邻门，批末共享回归；文档修改只检查链接、状态与依赖，不触发旧长搜索。
2. 在ticket记录实际证据与仍未完成项，更新TASKS；来源完成必须满足Engine规范。规则执行证明、Search当前认证、自然对局覆盖分别记账。
3. 在拥有改动的仓库提交并推送，记录commit与产物哈希；跨仓只链接，不复制规范或滚动进度表。报告中标明分支，不声称已合并默认分支或部署。
4. 汇报本批完成的来源/独立语义、固定队列剩余、验收结果和下一项。局部数字不写成全规则完成百分比，计划条目不写成实现完成。

## 当前参考

- [修正计划与全部ticket](DEVELOPMENT_PLAN.md)
- [对手回应合同及R21验收](../.scratch/warmachine-custom-matchup-wayfinder-v1/issues/21-multiturn-adversarial-chance-closure.md)
- [原理研究索引](research/ticket-search-principles-audit-20260905.md)
- [组合估时原始批次说明](https://github.com/ruarualoud/warmachine-strict-engine/blob/d29fa884109dc640b8db87d23286dbe27b0975be/docs/benchmarks/defensive-line-composition-trial-20260905.md)
