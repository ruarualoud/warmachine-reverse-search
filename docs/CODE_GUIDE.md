# 代码文档

## 入口与依赖

`src/upstream-project-d.mjs` 是 Engine Host 边界。文件名为历史兼容保留；新代码使用 `resolveWarmachineEngineRoot` 和 `WARMACHINE_ENGINE_ROOT`。Host 加载时递归计算源码闭包哈希，并把 Git revision、工作树状态和内容哈希写入 receipt。

`src/warmachine-host-runtime.mjs` 暴露规则、适配器、原子、概率和场景合同。`src/warmachine-construction-host-runtime.mjs` 暴露部署和阵型合同。`src/warmachine-construction-assets-runtime.mjs` 统一加载 Force Builder 和卡牌数据。

## 模块地图

| 目录 | 责任 |
| --- | --- |
| `src/contracts/` | 规则集基线、快照、漂移和失效合同 |
| `src/graph/` | 类型事实、稳定哈希、interaction graph 与外存 DAG |
| `src/reverse/` | 终局语料、前驱代数、空间商、历史/生命周期回归 |
| `src/search/` | 目标条件搜索、义务图、Chance、AND/min、CEGAR 和延迟游标 |
| `src/construction/` | 阵型候选与构筑支持，不裁决规则 |
| `src/matchup/` | 自定义任务、军表池、终局需求组、批调度、初始状态和值 |
| `src/report/` | 报告合同、中文呈现、控制台会话与真实素材映射 |
| `scripts/` | focused verifier、批处理命令、报告和控制台入口 |
| `config/` | 规则语义索引、基线和实验配置 |
| `.scratch/warmachine-custom-matchup-wayfinder-v1/` | Wayfinder 地图与 13 个研发工单 |

## 一条搜索路线

1. 自定义任务声明双方阵营/领袖/固定核心/可替换槽位/配装/点数/场景/地图/回合和预算。
2. Force Builder 生成内容绑定的合法军表；构筑宏型仅负责覆盖和排序。
3. 终局语料按刺杀、得分、固定轮次和同时胜负等需求组生成有限代表。
4. 任务适配器把代表物化为真实双方军表、真实模型、位置、生命、资源、损失、地形和胜利动作。
5. Engine strict 枚举并执行终局动作。结果分为 strict root、strict reject、候选过滤、输入错误、规则未知和预算延迟。
6. 前驱代数从终局向前恢复动作义务、位置关系、激活顺序、资源、随机与对手选择。
7. 每个提议前驱都由 Engine 正向执行一步认证；连续路线最终与合法部署初始状态汇合。
8. 独立 strict replay 不读取旧执行结果作为输入，并校验逐步状态/事件/终局哈希。
9. Chance 保存条件概率；对手节点按 AND/min；未展开质量留在上界。
10. 报告按军表、地图、部署和先后手给精确值或区间，并链接路线/拒绝证据。

## 关键身份

- `taskHash`：用户问题和预算的内容身份。
- `roster/list hash`：完整军表、附件、配装和分数身份。
- `openingKey`：军表、场景、地图、部署、Attacker/Defender 和先手的初始状态身份。
- `terminalTaskKey`：详细终局需求格身份。
- `planHash` / `checkpointHash`：批调度与恢复身份。
- `hostReceiptHash`：规则、原子、数据和构造 Host 源码闭包身份。
- `stateHash` / `actionKey` / `event hash`：strict replay 身份。

身份不匹配必须失效重建，不能用名称相似或旧报告补齐。

## 开发验证

每个改动的最小循环：

1. 运行一个精确 `--task=<terminalTaskKey>` focused verifier。
2. 同时验证正向成功和预期拒绝/失败分支。
3. 运行所属任务族 verifier。
4. 运行批次守恒、checkpoint 恢复和 Host receipt 漂移门。
5. 工单完成时运行 `npm run verify` 和 Engine 受影响门。

大型 `.scratch` 结果不提交。共享证据应生成小型、去路径化、内容哈希绑定的 fixture，或上传外部工件存储。
