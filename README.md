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

Wayfinder 共 `13` 个工单：`01–04` 已完成，`05` 正在进行，`06–13` 待完成。当前已完全验证的 Ticket 05 生产基线是 `37/64` 个终局任务处置，其中 `12` 个任务专属 strict 根、`2` 个 Host strict reject、`17` 个精确候选过滤、`6` 个规则来源未决、`27` 个预算延迟。

Ticket 05 后续 Gorman/Experimental Warhead 六任务改动已写入工作树，但交接前只单独验证了地形阻挡的 strict reject；其余五项以及更新后的全 `13` 项 verifier 仍需重跑。因此不能把当前代码宣称为 `43/64`。

完整状态见 [docs/HANDOFF_STATUS.md](docs/HANDOFF_STATUS.md)。代码导航见 [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md)，设计见 [docs/DEVELOPMENT_DESIGN.md](docs/DEVELOPMENT_DESIGN.md)，后续计划见 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)。

## 产物策略

`.scratch/`、`build/` 和搜索 DAG 不进入 Git。Wayfinder 地图与工单例外保留。每次运行应把计划、checkpoint、Host receipt、概率账和报告写入外部工件存储；Git 只保存源码、配置、小型夹具和可重建说明。

## 结论边界

- strict 根只证明该终局状态和动作可执行，不证明能从部署到达。
- strict 路线必须从合法开局独立重放到同一终局，才证明该路线可达。
- 未展开的对手回应、概率或路径保持值区间，不默认为失败或成功。
- 候选分数只安排计算顺序；代表数量不是自然概率。
- 没有用户声明或有证据的初始状态分布时，报告逐格给值区间，不宣称自然胜率或全局最优。
