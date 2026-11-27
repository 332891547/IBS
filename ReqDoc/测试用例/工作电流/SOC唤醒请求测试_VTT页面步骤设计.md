# SOC 唤醒请求测试：VTT 页面步骤设计（已实施，待台架验证）

## 01 范围与资源核查

依据《原始需求文档》6.12；本用例是**真实电池充满后，N8361 以 11.0 V 输出条件使电池放电，观察低 SOC 唤醒请求**，不是分别测试充电电流唤醒与放电电流唤醒。每轮的满充结果判新鲜 `Calc_Data_1::SOC_STATE=2` 且 `Calc_Data_1::SOC=100`；14.0 V 与 11.0 V 两段 N8361 充、放电限流均为 10 A。配置 `SOCWU_Ena=1`、`SOCWU_Treshold=80`，关闭 `ChargeCurrWU_Ena`、`DisChargeCurrWU_Ena`。以下保留已确认的页面设计作为实施依据；新增 `SOCWU_RequestOnce` 已写入 VTT。实际编译和台架验证状态见末节。

| 类别 | 更新工程中核实的资源 | 复用结论 |
|---|---|---|
| 固定模板 | VTT `PHASE_Prepare(string SequenceName)`、`PHASE_Complete()`；Completion 先关输出再等 DVM 回零，最后请求 SAFE | 保持已有 Preparation / Completion 的字段、顺序和实现不变；各轮必须先断开真实电池再进入 Completion |
| 已有 Test Case / Function | VTT `SOC_BatteryReadyCheck`、`SOC_FullChargeHold`、`SOC_CheckFullChargeResult(float)`、`SOCWU_LowSOCWakeup(float)`、`RELAY_SetState(int,int,int)`；`SOFWakeChargeDischargeOnce(int)` 已是五次单轮实例的参考结构 | `SOC_BatteryReadyCheck` 可复用；`SOC_CheckFullChargeResult(100)` 可复用 SOC=100、SOC_STATE=2 判据，但其内部会开 LIN 后又停 LIN，配置前须重新开 LIN；`RELAY_SetState` 与 SOF 五个实例结构可借鉴；`SOC_FullChargeHold` 的起始 SOC>70% 等附加门槛及 `SOCWU_LowSOCWakeup` 的 30 min / 3.7 h 窗口不适合直接调用 |
| 已有 CAPL 可调用节点 | `.can` `export testfunction LIN_OpenNormal_Check()`、`LIN_Stop_Check()`、`PWR_Configure_Check(float V,float Ichg,float Idchg)`、`PWR_On_Check()`、`PWR_Off_Check()`、`PWR_WaitZero_Check()` | 直接复用通断 LIN、电源配置与关输出；`PWR_Configure_Check` 的参数顺序是电压、充电限流、放电限流 |
| 参数 | `.vparam` `IBS_Reuse::IBS::TB_LinOpenTimeout_ms=2000`、`TB_LinStopSettle_ms=100`；`SOC满充矫正法测试::IBS::SOC_DvmStartVoltage_V=13.5`、`SOC_FullChargeHold_ms=1500000`、`SOC_ChargeVoltage_V=14.8`、`SOC_ChargeCurrent_A=5.25`；`SOCWU_Threshold_pct=80` | `SOC_FullChargeHold_ms=1500000` 正好是本案确认的 25 min，可复用该值；原 14.8 V / 5.25 A 不得替代本案 14.0 V / 10 A；80% 可复用其值 |
| `.can` 实际引用的系统变量 | `N8361::DVM_Voltage`、`Set_OutputSts`、`Set_OutPutVoltage`、`Set_ChargeCurrent`、`Set_DicChargeCurrent`；`LIN::LINMsg_RxCounter`、`LINMsg_RxCounterClear`；`Power_RelayCrtl::BatteryConnectEquipment`、`CAB1500_PowerCtrl`、`IBS_PowerCtrl` | 可以使用现有电源、继电器与 LIN 帧读数；命令状态并非物理触点反馈 |
| 候选测量与 LIN 信号 | VTT 已有 `_Statistics::LIN1::Wakeups`、`Frames` 的读法；SOF Case 已在页面内读取 `CAB1500_500::AnalogCurrent`、`CANMsg_RxCounter` 并以新采样 ≤4 mA↔≥14 mA、LIN Frames 不增长判休眠；LDF 有 `IBS_Frame4::SOCWU_Ena`、`SOCWU_Treshold`、`ChargeCurrWU_Ena`、`DisChargeCurrWU_Ena`，`Calc_Data_1::SOCWU_Sts`、`SOCWU`、`ChargeCurrWU`、`DisChargeCurrWU` | 可借 SOF 的休眠采样页面写法及已有低 SOC Case 的新帧检查写法；旧 Case 以 Wakeups 增长直接判请求的逻辑不适用于用户确认的自动唤醒统计语义。上述 CAB1500 与 `_Statistics` 变量**仍未在本项目 `.can` 实际引用**，新增 SOC Case 的可编译性、数据有效性须 F6 与台架验证 |

实施差异（已获用户确认）：vTESTstudio 4 安装版帮助明确“Test cases cannot be nested”；实际 F6 也拒绝在新单轮 Case 内嵌套已有 Case。因此 `SOC_BatteryReadyCheck` 的参数化电池电压/输出关闭检查与 `SOC_CheckFullChargeResult(100)` 的新有效帧、SOC=100、SOC_STATE=2 判据已改为新单轮内可见的等价原生步骤；下表保留原设计的直接复用写法以便对照，并非声称实际发生了嵌套调用。原 `SOC_CheckFullChargeResult(100)` 自带开、停 LIN。`SOC_FullChargeHold` 虽已有 25 min 参数，却额外要求起始 SOC>70%、温压区域及持续 SOC=100，不将其整套流程强加给本案；本案沿用其 25 min 参数值，在新单轮 Case 页面完成到压计时。`SOCWU_LowSOCWakeup` 固定 30 min 无唤醒、3.7 h 等待并按 OCV 表设压，不能替代本案 200 s / 2.1 h、11.0 V。`ChargeBatteryToFullSOC` / `DischargeBatteryToTargetSOC` 以 IBS 自报 SOC 为停止条件，也不能替代本案的到压保持与放电观察。

## 02 Test Tree：五个独立 Test Case

参考 SOF 现行 Sequence：一个参数化单轮 Case 定义，Sequence 中放五个独立实例，依次标记第一次至第五次。**每个实例都从真实电池接入、满充开始，到停 LIN、关输出、断开电池并确认 DVM 回零结束**；不能把五次判据折成一个循环 Case，也不能把第一次满充结果默认沿用至后四次。完整五轮循环版如将来需要，可另行保留定义，但目前不预设为已存在。

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Preparation | 准备 SOC 唤醒请求测试环境 | `PHASE_Prepare("SOC_WakeRequest")` | 已有 Test Table Function；沿用固定模板 |
| Test Case | SOC 唤醒请求：第一次 | 拟新增 `SOCWU_RequestOnce(RoundIndex=1)` | 新建单轮 Test Case 的第一个实例，未实施 |
| Wait | 第一轮结束后间隔至少 60 s | `Wait(60000 ms)`；上一轮关输出、断电池并确认 DVM 回零后计时 | 原生 Wait，五轮之间的第 1 处间隔 |
| Test Case | SOC 唤醒请求：第二次 | 拟新增 `SOCWU_RequestOnce(RoundIndex=2)` | 同一定义的第二个独立实例，未实施 |
| Wait | 第二轮结束后间隔至少 60 s | `Wait(60000 ms)` | 原生 Wait，第 2 处间隔 |
| Test Case | SOC 唤醒请求：第三次 | 拟新增 `SOCWU_RequestOnce(RoundIndex=3)` | 同一定义的第三个独立实例，未实施 |
| Wait | 第三轮结束后间隔至少 60 s | `Wait(60000 ms)` | 原生 Wait，第 3 处间隔 |
| Test Case | SOC 唤醒请求：第四次 | 拟新增 `SOCWU_RequestOnce(RoundIndex=4)` | 同一定义的第四个独立实例，未实施 |
| Wait | 第四轮结束后间隔至少 60 s | `Wait(60000 ms)` | 原生 Wait，第 4 处间隔 |
| Test Case | SOC 唤醒请求：第五次 | 拟新增 `SOCWU_RequestOnce(RoundIndex=5)` | 同一定义的第五个独立实例，未实施 |
| Completion | 完成测试并恢复安全态 | `PHASE_Complete()` | 已有 Test Table Function；固定模板不变 |

Sequence 遇到单轮失败应停止下一轮施加输出，同时尝试执行该轮安全收尾；报告中分别标出有效完成轮次。`breakonfail` 与 Case 内分支/收尾的实际执行语义需实施时验证，不能只依赖 Completion 处理仍接着真实电池的场景。

## 03 单轮 Test Case 页面步骤

以下每行均位于拟新增 `SOCWU_RequestOnce` 内，用户在 VTT 页面可见。满充保持采用用户确认的 25 min，观察窗口仍为 200 s / 2.1 h，不借用其他用例的 30 min / 3.7 h。沿用 SOF 页面已有的 ≤4 mA / ≥14 mA 采样门槛，不将 SOF 的充、放电**电流**唤醒阈值 160 mA 带入本案。

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| CAPL Function / Test Table Function | 关闭 N8361 输出，接入真实电池，保留 IBS 与 CAB1500 测量支路 | `PWR_Off_Check()`；按已核实接线调用 `RELAY_SetState(1,0,0)` | 已有 CAPL Function + 已有 Test Table Function；沿用工程中已使用的继电器命令元组；N8361 输出关闭后执行 |
| Test Case | 核对电池供电和输出关闭 | `SOC_BatteryReadyCheck`；记录 DVM 实测值 | **直接复用已有 Test Case**；不会误认为关闭 N8361 就使 IBS 断电 |
| CAPL Function | 设定 14.0 V，充、放电限流各 10 A，并开启充电输出 | `PWR_Configure_Check(14.0,10,10)`、`PWR_On_Check()` | 已有 CAPL Function；真实电池仍接入，N8361 对电池充电 |
| Await Value Match / Set | 等待 DVM 首次高于 13.5 V，记录满充计时起点 | `N8361::DVM_Voltage>13.5 V`；新采样首次达标才开始计时 | 原生页面节点；到压等待需要超时门限，待实施时明确，不得无限等待 |
| CAPL Function / Wait | 启动 LIN 读取 IBS 状态，到压后保持充电至少 25 min | `LIN_OpenNormal_Check()`；从 DVM 首次高于 13.5 V 的记录时刻起计 `1500000 ms`，LIN 正常调度 | 已有 CAPL Function + 原生计时/Wait；复用已有 `SOC_FullChargeHold_ms=1500000` 参数值，不从开 LIN 时重新起算 |
| Test Case | 校验满充 SOC=100、SOC_STATE=2 | `SOC_CheckFullChargeResult(100)`，取得同轮新有效 `Calc_Data_1` 报文 | **直接复用已有 Test Case**；该 Case 自行开 LIN、判两项并停 LIN，后续发送配置前重新开启 LIN |
| Set / CAPL Function / Wait | 配置仅 SOC 低唤醒，保持 LIN 正常通讯至少 2 s | `SOCWU_Ena=1`、`SOCWU_Treshold=80`、`ChargeCurrWU_Ena=0`、`DisChargeCurrWU_Ena=0`；`LIN_OpenNormal_Check()`，`Wait(2000 ms)` | 原生 Set / Wait + 已有 CAPL Function；满充检查 Case 已停 LIN，故必须重新开 LIN 发送 IBS_Frame4；失败不得进入停表段 |
| CAPL Function | 结束充电、停止 LIN，再预设 11.0 V 输出 | `PWR_Off_Check()`、`LIN_Stop_Check()`、`PWR_Configure_Check(11.0,10,10)`；输出保持关闭 | 已有 CAPL Function；电池仍给 IBS 供电。14→11 V 是**关 N8361 输出后改设定值、待唤醒观察窗结束再开启**，不是切换电池继电器，也不是关闭电池供电 |
| Set / Await Value Match | 停 LIN 后 90 s 内确认 IBS 休眠 | 新 CAB1500 接收帧的滤波电流在 0～18 mA 内出现 ≤4 mA↔≥14 mA 跳变，期间 LIN `Frames` 不增长；记录采样时刻、电流前后值及计数 | **拟新增 Case 内原生/少量 Inline 节点**，参考 SOF 同一电流采样门控；新帧缺失/读数不新鲜不当作 0 mA；失败或超时不施加 11 V 输出；≤4 mA / ≥14 mA 门槛已由用户确认 |
| Wait / Set | 休眠确认后额外等待 5 s，记录自动唤醒统计基线 | `Wait(5000 ms)`，随后记录 `_Statistics::LIN1::Wakeups` 和 LIN `Frames` | 原生 Wait / Set；5 s 不吞入 90 s 或 200 s 窗口；Wakeups 可统计自动唤醒，增长本身不构成误唤醒 |
| 事件检测 / State Check（待可用资源） | LIN 停止且输出关闭时连续观察 200 s，不得出现真正的 LIN 唤醒请求 | 对 200 s 内的总线唤醒请求帧/事件与内部自动唤醒事件**分别识别**；仅请求帧判误唤醒；记录自动事件的 Wakeups 增长供诊断 | **尚无核实的请求帧专用可调用节点/变量**，此行不是现成 API；不能仅以 Wakeups 不增长或 LIN Frames 不增长冒充 200 s 判据。资源不足时本轮不得判通过或施加 11 V 输出 |
| CAPL Function / Set | 200 s 无误唤醒判据通过后开启 11.0 V 放电输出 | `PWR_On_Check()`；记录开输出命令完成时刻，DVM 监测 IBS 端电压 | 已有 CAPL Function + 原生 Set；用户确认设压低于电池电压会使真实电池向 N8361 放电；施加前检查 11.0 V 低于电池当轮端电压 |
| 事件检测 / Await Value Match | 停 LIN 状态下最长 2.1 h 等待真正的低 SOC 唤醒请求 | 上限 `7560000 ms` 从开输出命令完成起算；区分自动唤醒和 LIN 唤醒请求，收到请求立即恢复 LIN | **请求事件区分接口待核实/新增**；Wakeups 增长仅是候选，不能单独判定低 SOC 唤醒成功；超时或未能区分时不判通过并进入收尾 |
| CAPL Function / Await Value Match / Wait | 收到唤醒后立即恢复 LIN，取得新有效帧并等待 2 s | `LIN_OpenNormal_Check()`，以新有效 `Calc_Data_1` 更新为起点再等 `2000 ms` | 已有 CAPL Function + 原生节点；参考已有低 SOC Case 新帧计数法，不能读停表前缓存 |
| State Check / Wait | 校验低 SOC 唤醒原因，维持唤醒后的 LIN 通讯总计至少 10 s | `Calc_Data_1::SOCWU_Sts=1`、`SOCWU=1`；`ChargeCurrWU=0`、`DisChargeCurrWU=0`；从恢复 LIN 起补足 10 s | 原生节点；2 s 包含在通讯总时长内，不能将标记检查挪至恢复前 |
| CAPL Function / Test Table Function / State Check | 停 LIN、关 N8361 输出、断真实电池并确认 DVM 回零 | `LIN_Stop_Check()`、`PWR_Off_Check()`；按实际接线复用 `RELAY_SetState(0,0,0)`，确认 `N8361::DVM_Voltage` 回零 | 已有 CAPL Function + 已有 Test Table Function + 原生 State Check；正常完成和可达的提前失败路径都需执行。断电期间不可误把 DVM 非零判为 N8361 仍在输出 |

## 04 已确认事实与实施边界

- **电池与测点：**真实电池接入时持续给 IBS 供电，DVM 测 IBS 端电压；N8361 的 11.0 V 输出设定低于当轮蓄电池端电压时，电池产生真实放电电流。页面在开输出前确认方向条件，记录放电段 IBS 端 DVM；型号写作 `N8361`。用户不要求把继电器触点反馈、反灌保护和 CAB1500 断帧超时列为本用例额外验收项；沿用工程的关输出后切继电器与异常收尾，不宣称其提供物理保护证明。
- **休眠门槛与重复间隔：**CAB1500 新采样电流在 0～18 mA 内形成 ≤4 mA↔≥14 mA 跳变；五个独立单轮 Case 之间各有一处至少 60 s 可见 Wait，共四处。90 s 休眠、休眠后 5 s、200 s 无误唤醒和放电后 2.1 h 各自独立计时。
- **真正阻断实施的事件区分：**用户确认 `_Statistics::LIN1::Wakeups` 统计自动唤醒事件，因此其增长**既不能单独判 200 s 内误唤醒，也不能单独判 2.1 h 内低 SOC 请求**。`Frames` 也只是总帧数。当前 `.can` 未实际引用 CAB1500 或 `_Statistics` 变量，现有 VTT 的 Wakeups 轮询也没有将自动唤醒与从节点 LIN 唤醒请求分类。实施时需先从现有 CANoe/LIN 测量配置核实可区分总线请求事件的真实资源；若没有，就新增并编译验证请求事件采集/分类封装，再在 200 s 和 2.1 h 两处使用同一请求证据。**在此资源核实前，两处均不能判通过，也不把“自动唤醒计数不增”作为验收条件。**无需用户再次确认前述 10 条事实。
- **交付阶段：**已在 `IBSTest/IBSTest.vtt` 增加五个独立单轮实例和四个 60 s 等待；本次未更改 `.can` / `.vparam`。单轮有效须 25 min 满充、SOC=100 且 SOC_STATE=2、200 s 无 LIN 物理唤醒帧、2.1 h 内收到 LIN 物理唤醒帧并由恢复通讯后的新帧标记确认；五轮均完成且满足四次 60 s 间隔才算覆盖。`testWaitForLinWakeupFrame` 为本机 CANoe 12 帮助与安装示例证实的 LIN 唤醒帧等待函数：返回 0 表示超时、1 表示收到帧，-1/-2 是错误；单独的唤醒帧不能证明源节点或唤醒原因，台架仍需核实来源区分及最终报告。

**验证：**最终安全收尾及 2.1 h 截止时间修正后，实际 F6 日志为 `# Compilation succeeded (23:07:10) -- 0 errors, 35 warnings`，`# Test unit created 'C:\Users\HF_company\Desktop\IBS\IBSTest\IBSTest.vtuexe'`。35 个警告中包含 `_Statistics` 分析变量访问提示，不能视为物理唤醒来源的证明。尚未运行真实台架，不能宣称五轮通过、睡眠判据或 SOC 唤醒来源已被实测确认。
