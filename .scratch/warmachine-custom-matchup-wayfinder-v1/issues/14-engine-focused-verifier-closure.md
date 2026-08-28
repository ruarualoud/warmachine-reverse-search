# 闭合 Engine 全量严格验证分母

Type: task
Status: resolved
Blocked by:
Part of: ../map.md

## Question

怎样证明搜索器依赖的当前 Engine 在真实执行全部规则原子与严格转换验证器后是绿色的，而不是只通过冒烟、微型夹具或空跑分片？

## Acceptance

- 版本化清单枚举当前仓库全部规则原子和严格转换 verifier，清单内容哈希可复算。
- 计划模式与执行模式输出不同状态；未执行不得返回成功，也不得计入通过数。
- 每个分片实际启动每个 verifier，保存退出码、超时、输出摘要和精确覆盖分母。
- 当前已知七个失败项与移动/LOS 超时项均有定位结果、正反场景和回归验证。
- 全分片通过后发布唯一 Engine source receipt；任何源码变化使该收据失效。

## Non-goals

- 通过修改期望掩盖执行回归。
- 把当前 verifier 分母称为全卡牌、全局面或数学完备证明。

## Progress

- 已建立 `235` 个规则原子 verifier 加 `28` 个 strict 转换 verifier 的 `263` 项版本化清单，并按稳定哈希分为八片。
- 首次真实执行结果为 `195/263`；无缺片、重复项、漏项或外来项。该结果是修复前基线，不是当前通过率。
- 已有 `52` 个基线红项通过独立 focused 复验；共享修复覆盖 source-contract 基础动作保留、旧 Free Strike 版本声明、同刻触发唯一键、抽离数据路径、续行动窗口持久化及 target-token upkeep 执行器错误；clean-clone roster 部署、先手时序、未命中伤害事件、RNG 证据、targeting 来源诊断、聚合回归证明闭包、`380` 原子／`466` 钩子消费者合同、Blade Glide lane 去重、Attack Type 当前拒绝语义、Bag Man/Trophy Hunter/Blood-Quenched 官方来源组合及 Blood Shadow/Drag/Skewer 历史 Free Strike 模式也已对齐。候选元数据现在让 projected-active destroyed-stage 原子优先于 inactive 攻击预览，Carnivore、Carrion Feast 与 Chop Shop 的 LLM/动作变体均重新通过。来源合同漂移已按动作谓词隔离，Death Burst 的旧文本不会误删普通攻击；Critical Shred 按当前单位级 Vengeance 窗口复验，Banish 与 Beat Back 完整 focused 分支通过。
- 分片子进程只跳过聚合 verifier 对已在同一 `263` 分母中独立执行依赖项的重复嵌套启动；直接运行聚合 verifier 时仍会完整执行其依赖，不降低验证范围。
- `Beat Back` 本次约 `255s`，低于但接近单项 `300s`；strict dice/damage 正确性通过但约需五分钟。
- 最终八分片在同一 `628` 文件源码闭包下完成 `263/263`：`235` 个规则原子 verifier、`28` 个 strict transition verifier，失败、漏项、重复、外来、超时与源码漂移均为 `0`。分片 5 首次只因八路 CPU 争用超时，隔离重跑在源码不变时通过 `41/41`。
- 已发布 Engine source receipt `e27e6a6d32c7b004676b8e9ece74310cffba2c4290b906aae29b7e53d27badf3`，manifest `78162f7de382437d876717c162747dd75f103d0744530e1c46946719ab4c16bf`，aggregate `04fa55df88cadedc1fe159f6c545834523a78da0d818520a34e98d721b03c04d`。
