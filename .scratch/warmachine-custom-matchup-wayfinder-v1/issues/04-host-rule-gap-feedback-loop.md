# 建立搜索暴露规则缺口的回流修复门

Type: task
Status: resolved
Blocked by: 01
Part of: ../map.md

## Question

当真实终局或反向路线因尚未执行的卡牌规则 fail-closed 时，怎样把最小场景、原子/钩子身份、关联规则和 Host 拒绝回流到规则执行层，完成修复后自动失效并重跑受影响搜索证据？

## Acceptance

- `Rampant Fury` 按当前数据文本严格执行，并覆盖一次/每回合、同激活再次 Frenzy、非 Frenzy 不触发和生命周期交互反例。
- Feast、Killing Spree、Tough、Fury/Focus、击杀三阶段及其它被任务路径命中的规则均以 Host 原子/钩子执行，不在搜索侧复制语义。
- 每个规则缺口绑定最小正反场景和 interaction graph 关联闭包；修复后原拒绝可重放并改变为明确的新处置。
- Host、原子、交互或数据收据变化会使依赖的终局根、反向路线和值报告失效重建。
- 未修复规则保持 `rules_unknown` 或 `strict_rejected`，不能由替代执行者掩盖全局覆盖债务。

## Current Evidence

- 当前数据中的 `Rampant Fury` 精确绑定来源 `3b732042-b688-4033-8341-ec7dd7312ef4`；Focused verifier 证明第一次 Frenzy 完成攻击后暂不结束激活或清除 Fury，同一激活中的第二次 Frenzy 复用完整 strict 序列，并且每回合只能触发一次。普通非 Frenzy 近战、没有该规则和正文漂移均不能误触发。
- 真实 Vordak 交互场景同时加载 `Rampant Fury` 与 `Feast [2]`。第一次 Frenzy 致目标 boxed 后，Host 先打开 Feast 使用/放弃生命周期窗口；放弃后才打开强制第二次 Frenzy。该场景暴露并修复了一个真实 Host 缺口：Frenzy 位于 Control Phase，但按规则是立即激活，所有“本模型激活期间”的攻击/击杀原子必须按动作语义识别，不能只检查 `phaseKey === activation`。
- 搜索侧新增 Host 规则缺口回流证据。旧 Host 回执 `80ce324eb55d360e09f7c0a4e66c9e9c4b491fe358112adaeb5503a7bb8dd14e` 下的处置是 `rules_unknown`；当前 Host 回执 `ded3332139ebfc00a73c8cc8f492ac015b243c5417eae6b6c56c3d0c28c9bda4` 下，同一最小动作严格执行为 `strict_transition_accepted`。规则正文漂移仍为 `strict_rejected`。
- 回流报告绑定精确来源正文、Host 回执、原子定义哈希和 interaction graph 闭包；当前闭包包含 `2` 个直接原子和 `28` 条关联规则。验证器证明 Host 漂移或规则来源漂移会使 `4` 份依赖证据失效并要求重建，未解决分支没有硬剪枝权或训练真值权。
- 报告位于 `.scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/host-rule-gap-feedback/rampant-fury-v20260814.json`，证据哈希为 `24edba8b1731f58f921d213647cf26501fbce9f829f89dce8e4b357f262a8ed8`。当前 Host 下 Ticket 02 的军表池、路由账、证据语料和真实终局根已全部重建并通过对应门禁。
- `verify-warmachine-rule-atom-rampant-fury-v20260814.mjs`、`verify-warmachine-rule-atom-feast-v20260714.mjs`、Threshold/Frenzy、Killing Spree/Tough、击杀三阶段/RFP、Focus/Fury 资源树及 `verify:host-rule-gap-feedback` 均通过。所有执行语义仍由 Project D Warmachine Host 原子/钩子负责，反向搜索仅消费严格枚举、执行回执和拒绝原因。
