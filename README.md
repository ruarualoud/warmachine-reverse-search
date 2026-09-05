# Warmachine Reverse Search

这是一个独立的、结果导向的 Warmachine 对抗搜索项目。它从刺杀或 Steamroller 得分终局出发，生成符号前驱和有限候选，再交给 `warmachine-strict-engine` 严格正向执行认证。

搜索器不复制规则，也不使用 LLM/Skill 决定合法性。规则、军表、部署、移动、概率、反应、生命周期和场景结算都以 Engine Host 回执为准。

## 仓库布局

推荐并排克隆：

```text
workspace/
  warmachine-strict-engine/
  warmachine-reverse-search/
```

默认会发现相邻的 `../warmachine-strict-engine`。也可以显式设置：

```bash
export WARMACHINE_ENGINE_ROOT=/absolute/path/to/warmachine-strict-engine
```

旧变量 `WARMACHINE_PROJECT_D_ROOT` 暂时兼容，但新环境应使用 `WARMACHINE_ENGINE_ROOT`。

## 快速验证

需要 Node.js 22 或更高版本。核心源码没有 npm 运行时依赖：

```bash
npm run verify:handoff
npm run verify:upstream
npm run verify:custom-matchup-task
npm run verify:custom-task-force-builder
npm run status:custom-matchup-wayfinder
```

完整历史门禁使用 `npm run verify`。它耗时较长；开发时先跑 focused verifier，工单收口时再跑聚合门。

## 当前里程碑

2026-09-05：当前Wayfinder共 `23` 个工单，`14` 个历史范围已完成、`9` 个开放。Ticket23完成 `8/12`，正在进行卡牌规则重认证；按Cryx -> Dusk（含Fane of Nyrro）-> Convergence推进，三族后贯通搜索链路。旧Strict/skill及完整对抗值仍保持隔离。

当前协作分支为 `codex/post-audit-mainline-recovery`。开发恢复先读[任务执行说明](docs/AGENT_TASK_GUIDE.md)；当前状态以[权威地图及各ticket](.scratch/warmachine-custom-matchup-wayfinder-v1/map.md)为准，各OPT直接维护开发/验收清单。

代码导航见[CODE_GUIDE](docs/CODE_GUIDE.md)，设计见[DEVELOPMENT_DESIGN](docs/DEVELOPMENT_DESIGN.md)，修正计划见[DEVELOPMENT_PLAN](docs/DEVELOPMENT_PLAN.md)。[HANDOFF_STATUS](docs/HANDOFF_STATUS.md)保留旧交接快照，不作为今天的工单进度。

## 策略工作台目标

目标是在明确任务域内支持两势力军表对抗、当前局面指导和到达指定目标局面的策略搜索。三者共享规则与搜索内核，但当前控制台仍以终局种子/回放为主；局面导入、完整对抗建议及选手决策对比尚待现有ticket完成，不能当作已经可用的通用策略器。详见[用途与开发缺口](docs/STRATEGY_WORKBENCH_SCOPE.md)。

## 产物策略

`.scratch/`、`build/` 和搜索 DAG 不进入 Git。Wayfinder 地图与工单例外保留。每次运行应把计划、checkpoint、Host receipt、概率账和报告写入外部工件存储；Git 只保存源码、配置、小型夹具和可重建说明。

## 结论边界

- strict 根只证明该终局状态和动作可执行，不证明能从部署到达。
- strict 路线必须从合法开局独立重放到同一终局，才证明该路线可达。
- 未展开的对手回应、概率或路径保持值区间，不默认为失败或成功。
- 候选分数只安排计算顺序；代表数量不是自然概率。
- 没有用户声明或有证据的初始状态分布时，报告逐格给值区间，不宣称自然胜率或全局最优。
