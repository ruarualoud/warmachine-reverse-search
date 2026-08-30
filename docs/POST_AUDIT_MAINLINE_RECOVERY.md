# 合作分支审计后的主线恢复方案

## 决定

两仓均从各自 `main` 继续。`manus/phase1-ruleset-ticket05` 只作为问题档案和补丁供体，不整体合并，也不直接恢复其 v4-v8 checkpoint。

Wayfinder 从 13 个工单扩为 18 个。新增 Ticket 14-18 先闭合 Engine 真值、跨仓收据、候选完整性、恢复原子性与有限几何缩减，然后才允许 Ticket 05 重新生成生产 checkpoint。

## 可选择移植

| 供体 | 处理 |
|---|---|
| Engine `b0c2e55` 的七个 micro fixture 审计 | 逐项核对并移植；它不改变执行器。 |
| Engine `acdfe8a` 的 Critical Smite、Snacking、Mind Burst、base-size/Vengeance、secondary-hit timing | 分成独立小补丁，每项保留正反 verifier；不得整体移植。 |
| focused verifier 分片清单思路 | 重写为未执行即非成功，并增加全分片聚合收据。 |
| 合作分支的问题清单与合同粒度建议 | 作为设计输入；量化估算与历史 checkpoint 可恢复性不作为事实。 |

## 必须重写

- 候选块推进：合作实现会在块内首个合法候选后跳过未检查槽位。
- 移动刺杀 LOS 合同：合作实现同时要求互斥 action type。
- transition 恢复：合作实现会把带拒绝收据的失败误报为 `in_progress`。
- 规则集提升：合作 Search 绑定 Engine 中间提交，和分支最终源码不一致。
- clean-clone 门：合作 integrated verifier 依赖未提交 `.scratch` 和审计机绝对路径。
- 多 profile 枚举与几何穷举：固定取首项及未经证明的 `31 x 8 x 32` 路径均不能进入生产。

## 执行顺序

```text
14 Engine 全量门
  -> 15 跨仓收据与干净克隆
    -> (16 候选完整性 + 17 恢复原子性)
      -> 18 有证明的几何缩减
        -> 05 批量终局根重建
          -> (06 刺杀反推 + 07 得分反推)
            -> 08 对抗概率闭包
              -> 09-13 报告、控制台、全阵营、更新与产品门
```

## 当前可信边界

- `main` 的历史 `37/64` 只描述交接时的旧 Engine receipt，不是当前生产完成度。
- 合作报告的 `50/64` 不能直接抢救，因为 checkpoint 没有绑定 Search 物化器源码。
- 在 Ticket 14 和 15 完成前，不运行生产几何搜索，不发布新胜率或对抗优劣结论。
