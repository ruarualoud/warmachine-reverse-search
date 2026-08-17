# 打通全阵营自定义任务与精确配装构筑

Type: prototype
Status: resolved
Blocked by: 01
Part of: ../map.md

## Question

怎样让用户为任意阵营声明领袖范围、固定卡牌核心、数量上下限、附件关系、可替换槽位、可配装模型、点数、场景、地图、先后手和搜索预算，并得到目标驱动且经 Force Builder 精确验证的有限军表宇宙？

## Acceptance

- 任务 schema 支持固定领袖、全部领袖、固定核心、禁止项、附件约束、模块配装、场景、地图、先后手、轮次范围和预算。
- 军表生成复用正式写表器的费用、FA、附件、战斗群和可配装选项，不以名称拼接或静态默认配装代替。
- 任意阵营可建立内容绑定的有限合法池；每个未枚举、拒绝、去重和预算延迟质量均可审计。
- 用户固定完整军表时只搜索部署与路线；用户只固定阵营或核心时继续搜索合法军表。
- 至少用 Cryx/Fane 固定题和另一个具有不同配装结构的阵营做端到端验证。

## Current Evidence

- 自定义任务 schema 已覆盖双方独立的固定/所选/阵营全部军队与领袖模式、固定完整军表、卡牌精确/最小/最大数量、禁止卡牌/类型、逐副本配装、附件目标、战斗群控制者、Steamroller 场景、地图、先后手、轮次范围和分层搜索预算。固定完整军表会产生唯一构筑并把后续工作域明确限制为部署与路线。
- 通用构筑编译器直接调用当前正式 Force Builder，绑定数据版本 `40041`、rules-v1 Host 收据 `ded3332139ebfc00a73c8cc8f492ac015b243c5417eae6b6c56c3d0c28c9bda4`、构筑 Host 收据 `cb49be72fc3e9bb214a7268bddc751044f75b772d3339388eba0acb65d8ff301` 和 Force Builder 源码哈希 `b980b0a5f3eada0122279d73c615abce1ed53d4a5deb30a00cd8f147e5b47ebc`。费用、FA、附件上限、战斗群关系和模块选项均由该写表器作精确合法性裁决。
- 固定验收题的完整生产池含 `27` 个合法 Sepsira 核心候选和 `56` 个合法 Fane 候选，绑定 `18,517` 个终局代表、`2,049` 个详细需求组和 `13` 个构筑宏型。Focused 有界夹具保留 `3/8` 个候选并覆盖 Fane 四名领袖；另一条 Winter Korps 可配装夹具生成 `3` 个精确模块军表，Dusk 全阵营模式解析两个军队，固定完整军表模式只生成 `1` 个构筑。
- 每个池分别保留未尝试精确状态、包排除、预算裁剪、Force Builder 拒绝、去重、归档遗漏和战斗群替代分配账；这些处置不被改写为规则拒绝、不可达或劣势。领袖、自动随从、固定核心、固定配装和可替换包全部参与终局能力特征，避免固定核心在目标路由中“隐身”。
- 验收发现并修复正式写表器允许同一单位绑定多个 Command Attachment 的真实缺口；当前每单位最多一个 Command Attachment、三个 Weapon Attachment、一个 Leader Attachment。Weapon Attachment 替换 Grunt 的实体模型数量也进入构筑证明：Kriel Warriors 可合法绑定三个 Caber Thrower，第四个严格拒绝，替换前后实体总数保持一致。
- `verify:custom-task-force-builder` 的证据位于 `.scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/force-builder/custom-task-force-builder-v1.json`，证据哈希为 `c2b40fe041b81e0899d32945b9d1c754e8cee058b4096d84172683e44a8bfe3f`。任务、需求分组、证据语料、军表路由、真实终局、Command Attachment 与 Force Builder 关系门禁均通过，相关源码语法检查和 `git diff --check` 通过。
- 当前输出仍是内容绑定、预算有限、目标条件化的合法候选宇宙，不是阵营全部军表的穷尽枚举。构筑分数只安排处理顺序；部署到终局的 strict 可达性、对手闭包和值区间由后续工单负责。
