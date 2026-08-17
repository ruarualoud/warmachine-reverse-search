# Warmachine 终局前驱代数 V2

## 目的

本模块把一个期望的 Steamroller 2026 刺杀或得分终局表示为可审计的最小证明，再反向展开为类型化前驱义务。它生成候选和证明义务，不复制规则，也不伪造 rules-v1 的逆状态。

## 最小终局证明

刺杀证明至少绑定：

- 精确 Steamroller 2026 场景 profile；
- 双方完整且显式的 Leader 身份；
- Host terminal 的赢家与请求赢家一致；
- 胜方仍有 Leader，败方已无 Leader，或 Host 已执行全 Leader 同时移除的平分裁定；
- 生命周期、最终计分和“刺杀结果不被最终 VP 覆盖”的 strict 事件链。

得分证明至少绑定：

- 精确 Steamroller 2026 场景 profile；
- 不早于防守方第二回合结束的计分窗口；
- 在赢家的对手回合计分后检查；
- 至少 3 VP 的领先；
- 精确场景结算事件和得分 terminal；
- Host terminal 的赢家与请求赢家一致。

期望中的未来终局只是 candidate。只有 rules-v1 strict 重放实际产生对应 terminal，所有终局事实才可成为 `strict_certified`。刺杀和得分 terminal 不得互相冒充。

## 五层时间

前驱代数保留五个相对层，同时绑定绝对回合和行动方约束：

1. `victory_event`：终局事件及结算前一刻。
2. `activation`：产生终局条件的合法激活和动作序列。
3. `turn`：同一回合更早的激活顺序、位置和资源准备。
4. `previous_turn`：完整的上一方回合、维护、反制和计分。
5. `previous_round`：上一轮的交换、持续效果、资源和部署历史。

搜索模式分别只展开前 1、2、3、4 或 5 层。当前 Host 没有完整逆转移算子，所以除终局事件外，每层都保存 `complete_inverse_transition_not_available`，不凭空构造合法前驱状态。

## 代数语义

- `AND`：终局事实、规则能力和时间条件全部需要满足；概率采用安全 Fréchet 区间。
- `OR`：路线控制方可选择一个已生成 provider；未穷尽游标保留未知候选。
- `ADVERSARIAL_AND`：候选必须经受已生成的对手回应；未穷尽回应集合保留最坏未知分支。
- `CHANCE`：按概率质量加权；未枚举质量的区间保持为未知。
- `TRIGGER_AND_OR`：强制触发全部执行，同一控制窗口的合法顺序是选择分支。
- `ADVERSARIAL_REACTION`：对手合法反应按最坏情况，己方反应按所选路线处理。
- `STRICT_WITNESS`：一条完整 rules-v1 strict 正向重放收据。
- `UNRESOLVED`：未知 provider、逆转移、回应、随机质量、触发顺序或反应窗口。

即使一条具体路线有 strict witness，也只证明那条动作、选择、反应和随机结果路径可执行；它不证明对所有对手回应稳健，也不证明完整概率质量或全局最优。

## 军表来源与战略交换

完整军表来源账不会在模型被 disabled、boxed、destroyed、removed、替换或休眠后删除模型。每个模型保留卡牌/模型来源、单位组、控制者、战斗群和替换关系；来源缺失保持 unresolved。

战略交换账按单位组记录双方新移除分数、场景分变化和资源变化。`strategicIntent` 与 `deliberateExchange` 是路线解释来源，不是规则真值，也不能自行成为训练标签。

## 外存表示

rules-v1 状态继续写为外存 DAG 的 `state`；代数摘要和路线来源写为 `label`；每条未知义务写为独立 `unresolved`。代数节点不会伪装成规则状态，收敛状态也不会丢失不同终局证明后缀。

## 当前验证边界

focused verifier 已覆盖真实 strict 刺杀、得分、最终 VP 不覆盖刺杀、错误回合得分不胜、多个敌方 Leader 不刺杀、106 模型五层代数、概率与对抗区间、完整军表生命周期、战略交换和外存持久化。当前原型仍未生成真正的多层逆状态，也未穷尽对手、随机、触发和反应分支，因此硬剪枝保持关闭。
