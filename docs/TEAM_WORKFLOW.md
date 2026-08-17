# 团队协作流程

## 分支与仓库

- 规则/原子/卡牌执行改动进入 `warmachine-strict-engine`。
- 搜索、批处理、DAG、值和报告改动进入 `warmachine-reverse-search`。
- 每个 Wayfinder Ticket 使用独立分支；共享 schema 先单独提交再并行开发。
- 不把 Engine 源码复制回搜索器，不在搜索器中加入规则 fallback。

## 搜索 PR 必填证据

1. Wayfinder Ticket 和精确任务/需求组。
2. Engine commit 与 `hostReceiptHash`。
3. focused verifier 命令和输出摘要。
4. strict root/reject/filter/unknown/deferred 处置守恒。
5. 概率质量、对手节点和 unresolved 上界变化。
6. 是否使旧 checkpoint/report 失效。

## Engine PR 必填证据

1. 规则来源和真实卡牌。
2. 原子/钩子/interaction closure。
3. 正向成功与负向拒绝场景。
4. 生命周期、资源、几何、随机和反应受影响范围。
5. 搜索器需要定向失效的依赖键。

## 工件

批量计划、checkpoint、DAG、replay 和截图上传外部工件存储，文件名包含 schema、task hash、Engine receipt 和内容哈希。Git 只提交小型去路径 fixture 与报告索引。

## 冲突控制

`src/upstream-project-d.mjs`、任务 schema、checkpoint schema、值 schema 和报告 schema 是协调文件。多人需要修改时先确定一个负责人；其他分支通过新模块扩展，不同时重写同一共享文件。
