# 重建跨仓收据与干净克隆基线

优化任务 `OPT-15` 已直接列于本工单的“开发补充”中；[原理审计](../../../docs/research/ticket-search-principles-audit-20260905.md) 仅保留依据与索引。`Blocked by` 表示最终完成依赖，历史验收范围不追溯改变。

Type: task
Status: resolved
Blocked by: 14
Part of: ../map.md

## 开发补充：OPT-15（2026-09-05）

以下为历史验收之外的维护/扩展待办，当前全部待实现/待验收；保留原完成状态，不要求重跑全部历史搜索。由相关开放工单集成时执行，不把它们新增成历史关闭门。

- [ ] 分层绑定数据、规则实现、查询、候选发现域、Search执行代码和展示素材的内容指纹；不把无关文档变更作为重搜理由。
- [ ] 干净克隆对照规则变化、新增候选能力和文档变化，分别验证必要失效与安全复用；新增发现依赖索引由12实现，不另建第二套。
- [ ] 跨仓收据不一致继续失败关闭；历史路径可展示但不得恢复当前认证，父子进程必须绑定同一份源码内容。


## Question

怎样让 Search 的规则集提升、checkpoint 与报告精确绑定最终 Engine 和 Search 执行源码，并在没有历史 `.scratch` 的干净克隆中重现全部验收？

## Acceptance

- 收据包含 Engine commit/dirty/source closure，也包含 Search commit/dirty 与物化器、计划器、恢复器源码 closure。
- Engine 最终源码变化会使 Search ruleset snapshot fail closed；不存在绑定中间提交而运行最终提交的混合状态。
- 所有 integrated verifier 自行生成最小输入工件，或读取已提交的不可变 fixture；缺少历史运行目录不会 `ENOENT`。
- 历史 checkpoint 仅在完整本地执行语义收据相同且独立 replay 通过时复用；否则只作历史证据。
- 干净 worktree 的聚合命令可重现当前基线和精确未完成分母。

## Progress

- 已建立路径无关的 Search 执行依赖闭包。当前从终局物化器、批计划器、任务执行器和恢复器八个入口递归得到 `50` 个本地源码文件；执行依赖变化会改变收据，不相关 Search 文件变化不污染该闭包。
- 复合收据同时封签 Engine core Host、construction Host 的 commit/dirty/source hashes，以及 Search commit/dirty/source closure；ruleset snapshot、批计划、checkpoint、worker 完成结果均携带同一 `executionSemanticReceiptHash`。
- 历史 pinned 结果不能只凭 `reportHash` 刷入当前 checkpoint；它还必须匹配完整执行语义收据，并提交通过、同报告哈希、同 strict receipt 的独立重放密封证明。
- 新增两个不读取历史 `.scratch` 的 self-generated clean baseline：批计划/checkpoint 合同和任务执行合同。缺少物化器时保持 budget-deferred，提供当前 strict materializer 时完成结果绑定复合收据。
- Search 最初绑定 Ticket 14 Engine 收据，并在 Ticket 16 执行器变更后按同一合同重绑收据 `0470fad83eab5f5a865d992029997aedb6f9c36245bca22143a2773f4345286f`；路径无关的物化器、计划器、执行器与恢复器闭包为 `51` 文件，Engine 或 Search 执行依赖漂移都会使收据失效。
- reviewed ruleset 当前为 `warmachine-ruleset-2026-08-21-remote-40041-ticket16-reclose-v1`。旧 checkpoint 不能在新执行收据下恢复，历史结果只保留为证据。
- 固定 Steamroller fixture 默认改读 Engine 收据覆盖的 `fixtures/ruleset-baseline/construction-pool-report.json` 与 `fixed-roster-room.json`，不再依赖历史 `build/warmachine-ai/...`。完整固定基准通过 `103` 模型开局、`140` 转移得分路线和 `60` 转移刺杀路线。
- 跨仓 clean baseline 扩展为 `6/6` 并全部通过：Engine Host、Search 执行收据、ruleset snapshot、固定 fixture、批计划/checkpoint、任务执行；缺输入工件、失败与超时均为 `0`。
- Search 执行闭包不含 LLM、HTTP Provider 或 skill-router 入口。ctx2skill/skill2ctx 对本 Search-only 提升不适用；该结论不认证 route3、自弈或人机对战。
- Search 与 Engine 保持独立 Git 根和独立 GitHub 远端；父 `project-d` 工作树显式忽略这两个目录。Chance parity 验证也只通过统一 Host loader 取得 Engine，不再硬编码相邻仓库的源码导入路径。
