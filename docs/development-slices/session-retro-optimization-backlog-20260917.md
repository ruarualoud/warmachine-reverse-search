# 2026-09-17 会话复盘优化待办纵切

状态：仅登记，全部未实施。

本纵切不改变当前 Warmachine 搜索语义、运行参数、规则收据或 Codex with ChatGPT 安装状态。完整激活生产继续按现有参数运行；以下项目须另行领取、逐项验证。

## Search 运行与工程

- [ ] 为 rolling parent 的结果保留量和 RSS 上限增加自动回归，覆盖大分片结果及时释放、epoch 退出释放堆、压缩后磁盘回收和 OOM 后只从 canonical checkpoint 恢复。
- [ ] 统一进度口径，分别公开当前 epoch、当前决策节点、当前根层、完整激活、完整回合和最终报告的分母，禁止用局部 chunk 数估算全任务完成率。
- [ ] 把心跳与异常判定做成所有长任务共享的正式接口，稳定公开 worker 数、最近进度时间、checkpoint 年龄、磁盘余量和停止原因；不再依赖临时外部 monitor。
- [ ] 增加最小 CI，覆盖语法、包脚本、关键 focused verifier 与长任务调度合同；当前仓库尚无 `.github/workflows`。
- [ ] 给常用验证增加统一 `test`/`lint`/`typecheck` 入口，但不得因此触发历史全量搜索或重复已通过门禁。
- [ ] 精简 `TASKS.md`、`PROJECT_MEMORY.md` 的恢复读取成本，建立按 ticket/日期索引；保留完整历史，不用摘要覆盖原始证据。

## Codex with ChatGPT 外部项目

- [ ] 校正 Skill 的 JSON 能力声明：`c2c stop` 与 `c2c logs` 当前不接受 `--json`，文档和 CLI 必须一致。
- [ ] 修正 quick tunnel 健康判断：用户选择 quick 且尚无历史公网地址时，`doctor` 不得把“本地模式”误报为 tunnel 通过。
- [ ] 在 setup 开始前加入完整依赖和内置浏览器能力预检；缺失内置浏览器时应在生成配对码前明确失败关闭。
- [ ] 为 macOS Homebrew 因过期 Command Line Tools 失败提供受控的官方二进制回退，并验证版本、路径和可执行性。
- [ ] 为 Skill 安装器的 Python SSL 失败增加 Git 传输回退，避免同一来源需要人工切换安装路径。
- [ ] 为该项目增加最小 CI，覆盖 build/typecheck/test 及 CLI 参数兼容矩阵；当前仓库尚无 `.github/workflows`。

## 验收边界

每项必须先有对应缺陷或性能证据，再做最小修改和一次受影响验证。登记本清单不代表任何项目已经优化，也不阻塞当前完整激活生产。
