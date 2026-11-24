# SOC自校准功能测试-满充矫正法：页面伪代码与实施记录

## 01 本次流程

已确认执行顺序：**首次充电持续读 IBS SOC；SOC 严格 >70% 后等待 DVM 实测电压 >13.5 V，从首次到压起持续充电 25 min；温压首次进入图示区域后须持续合格至计时结束，SOC 达到 100% 后须持续保持至计时结束。停充静置 4 h，静置结束使用同一轮新鲜读数检查并记录 SOC=100% 与 SOC_STATE=2。**不能在刚到 SOC=100% 时提前停充。之后依次处理目标 90%→80%→70%→60%→50%；**每次静置后记录新鲜 SOC，以此作为下一目标的调节起点**：高于目标放电，低于目标充电，等于目标不调节；调节越档则反向修正，直至精确等于目标或达到兜底时限/次数上限。每档到位后传本用例配置的 60 s 断电时长调用 `Restart_IBS`、按旧工程时长静置，最后判该档 SOC_STATE=2 并记录 SOC。逐档 SOC 按 IBS 自报值控制，不证明真实电池 SOC 精确到目标。

CAB1500 在首次测量之前断开；DVM 测量时电池和 IBS 均接通（电池/CAB1500/IBS=`(1,1,0)`）。`N8361::DVM_Voltage` 为实测电压，`Measured_Data.T_BATT` 为物理温度。25 min 从首次测得 DVM >13.5 V 起算，SOC >70% 必须先满足；后续五档不再重复满充。**拟扩展现有** `ChargeBatteryToFullSOC` 为两种页面可见模式：原用例及档位补充电保持“到目标 SOC 即停”，本用例首次满充用“达门槛后持续充电 25 min”且在保持段持续核对温压与 SOC；所有原调用点显式选择原模式。当前函数尚无模式参数，不能把现有调用说成已满足 25 min。

附图温压区域暂按先前确认草案的线性边界（含端点，**图像读数/边界仍待核对**）：10～25 °C 下界 `15.0-0.1*(T-10)` V，上界 15.5 V；25～40 °C 为 13.5～15.5 V；40～60 °C 下界 13.5 V、上界 `15.5-0.05*(T-40)` V。仅 `Status_Temp=0` 且 T 有效时判温压合格。DVM >13.5 V 只是**启动 25 min 计时的门槛**，并不替代附图温压区域判断。

## 02 已核实资源（只读）

| 类别 | 当前工程资源 | 边界 |
|---|---|---|
| 参数 | `IBSTest/IBSTest.vparam`：`IBS::SOC_ChargeVoltage_V=14.8`、`SOC_ChargeCurrent_A=5.25`、`SOC_ChargeTargetSOC_pct=100`、`SOC_DischargeVoltage_V=10.5`、`SOC_DischargeCurrent_A=5.25`、`SOC_StepTimeout_ms` Normal 72000000 ms / Test 60000 ms、`SOC_PointRest_ms` Normal **14400000 ms（4 h）** / Test **60000 ms（1 min）**；`IBS::TB_MaxSwitchVoltage_V=1.0`、`TB_DvmZeroTimeout_ms=1000`。 | 旧工程 `IBS::PointRest_ms` 也是 Normal 14400000 ms / Test 60000 ms；当前参数已继承这一时间，直接复用。 |
| CAPL 函数 | `IBSTest/IBSFunctions.can` 已有 `LIN_OpenNormal_Check()`、`LIN_Stop_Check()`、`PWR_Configure_Check(float V,float Ichg,float Idchg)`、`PWR_On_Check()`、`PWR_Off_Check()`、`PWR_WaitZero_Check()`、`RELAY_SafeSwitch_Check(int state)`。 | 当前 `PWR_Configure`/`PWR_On` 无条件拒绝 `BatteryConnectEquipment=1`；**已决定删除这两处一刀切拒绝**，保留设定电压/限流范围校验。电池接入时另设“实测 10～15 V”前置检查。`RELAY_Set` 的 1 V 切换门槛也已决定取消，仅保留输出命令已关条件。以上均尚未改代码。 |
| Test Case | `ChargeBatteryToFullSOC(ChargeVoltage_V,ChargeCurrent_A,ChargeTargetSOC_pct,ChargeDischargeTimeout_ms)`、`DischargeBatteryToTargetSOC(DischargeVoltage_V,DischargeCurrent_A,DischargeTargetSOC_pct,ChargeDischargeTimeout_ms)`、`CheckSOCStateCalibrated()`、`CheckSOCStateUncalibrated()`、`WaitForSOCRestCalibration()`。 | 当前充/放电依据 IBS 自报 SOC；充电到目标即停，**还没有**固定保持模式。拟给共享充电用例增加模式及保持时长参数，原调用显式选即停模式。`CheckSOCStateCalibrated` 不单独查 `SOC=100`；静置复用 `SOC_PointRest_ms`。原充/放电用例直接 Set N8361 输出，并未经过 `PWR_On_Check` 的互锁。 |
| Function / Sequence | `PHASE_Prepare(string SequenceName)`、`PHASE_Complete()`、`Restart_IBS()`；`SOC_RestCalibration` 当前有 100%→90%→80%→70%→60%→50% 等档位。 | `Restart_IBS` 当前**无参数**，断 IBS 电 6 s、上电后等 1 s。拟增加断电时长输入参数：本用例传 60000 ms，已有调用点保持原 6000 ms；不要全局改默认值。尚非现有可调用签名。**已确认**本测试可用继电器断 IBS 电 60 s 代替连接器拔插。固定 Preparation/Completion 不变。 |
| 信号和继电器 | 工程 LDF 有 `Calc_Data_1.SOC`（0..100）、`SOC_STATE`（2 为已校准）、`Measured_Data.T_BATT`（物理温度 °C）、`Status_Temp`（0 正常）；`.can` 引用 `@sysvar::N8361::DVM_Voltage`、`Set_OutputSts`、`@sysvar::Power_RelayCrtl::BatteryConnectEquipment`、`CAB1500_PowerCtrl`、`IBS_PowerCtrl`。 | 测量态 `(1,1,0)`；断电池保持 IBS 为 `(0,1,0)`。`RelaySafe` 参数为 `(0,1,1)`，会断 IBS，故本用例不走 SAFE。台架在 `(0,1,0)` 且输出停止时 DVM 约 0.1～0.2 V。 |
| Test Table Function（拟新增） | 直接按元组写三个继电器命令，无前置判断 | `RELAY_SetState(int Battery,int CAB1500,int IBS)` | 拟新增 Test Table 内部 Function；页面可见三个原生 `set`，可参照已有 `Restart_IBS` 的写法（该函数内部就是原生 `set`+`wait`）。**不改动** `RELAY_Set`/`RELAY_SafeSwitch_Check`；本函数不加输出、DVM 前置条件 |

## 03 Test Sequence 页面步骤

下表中 `CheckInitialFullCharge` 和 `AdjustRestPoint` 为**拟在 Test Table 页面中新增的内联 Test Case 分组**（目前工程不存在），内部可见步骤列在第 04 节；共享充电用例的模式扩展也仅是设计。已有 Test Case 优先复用，不把整套流程藏进 CAPL。测试应在某档失败时停止继续下一档，失败/中断的安全收尾另需验证。

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Preparation | 准备满充矫正测试环境 | `PHASE_Prepare("SOC_FullChargeCorrection")` | 已有 Test Table Function；固定模板，不修改 |
| Test Case（内联，拟新增） | 首次满充：断开 CAB1500、接入电池、充电与校准判定 | `CheckInitialFullCharge`；内部见第 04 节 | 内联 Test Case，页面展开；当前不存在，不可调用 |
| Test Case（内联，拟新增） | 90% 档：根据静置后 SOC 选择充/放电，检测 SOC=90%，复位、静置、查已校准并记录 SOC | `AdjustRestPoint(90)`；内部见第 04 节 | 内联 Test Case；含越档反向修正，未达到精确等值不能报通过 |
| Test Case（内联，拟新增） | 80% 档：根据静置后 SOC 选择充/放电，检测 SOC=80%，复位、静置、查已校准并记录 SOC | `AdjustRestPoint(80)` | 同上；使用前档静置后的新鲜 SOC |
| Test Case（内联，拟新增） | 70% 档：根据静置后 SOC 选择充/放电，检测 SOC=70%，复位、静置、查已校准并记录 SOC | `AdjustRestPoint(70)` | 同上 |
| Test Case（内联，拟新增） | 60% 档：根据静置后 SOC 选择充/放电，检测 SOC=60%，复位、静置、查已校准并记录 SOC | `AdjustRestPoint(60)` | 同上 |
| Test Case（内联，拟新增） | 50% 档：根据静置后 SOC 选择充/放电，检测 SOC=50%，复位、静置、查已校准并记录 SOC | `AdjustRestPoint(50)` | 同上 |
| 断电池步骤 | 输出关闭后断开电池，IBS 保持接通；再读 DVM | `RELAY_SetState(0,1,0)`、新鲜 `N8361::DVM_Voltage` | 拟新增 Test Table Function；内部只写三个继电器命令，无输出/DVM 前置判断；DVM 读数仅作记录与后续参考 |
| Completion | 关闭输出并恢复安全态 | `PHASE_Complete()` | 已有 Test Table Function；固定模板，不修改 |

## 04 两种 Test Case 的页面内部节点

### 首次满充 `CheckInitialFullCharge`（拟新增内联 Test Case）

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| State Check / Await Value Match | 在切 CAB1500 前确认电源输出关闭、电池未接入、DVM 在低压阈值内 | `N8361::Set_OutputSts=0`、`BatteryConnectEquipment=0`、`N8361::DVM_Voltage` 相对 0 V ±`TB_MaxSwitchVoltage_V`，超时 `TB_DvmZeroTimeout_ms` | Test Case 内原生检查节点；电源/触点实际状态仍需台架确认 |
| Test Table Function（拟新增） | 断 CAB1500、保持 IBS 接通 | `RELAY_SetState(0,1,0)` | 拟新增 Test Table Function；封装三个原生 `set`，无前置判断 |
| Test Table Function（拟新增） | 接入真实电池给 IBS 供电 | `RELAY_SetState(1,1,0)` | 同上；保持到电压测量与后续放电结束 |
| 电池接入供电前置检查（待验证） | 已接入电池且输出仍关闭时，确认实测电压为 10～15 V 且新鲜有效，才进入充电启动步骤 | `BatteryConnectEquipment=1`、`N8361::DVM_Voltage` 10～15 V | 拟移除 `PWR_Configure/PWR_On` 两处“电池已接入即拒绝”硬条件，**不移除设定电压/限流校验**；只有接入后 DVM 读数可用，不能声称已在接入前测量电池 |
| 共享充电 Test Case（拟扩展） | 经前置检查后配置 14.8 V、5.25 A 并开输出，按模式到目标即停或持续 25 min | `ChargeBatteryToFullSOC(...,ChargeMode,HoldTime_ms)`（拟增参数；内部启动拟改用已有 `PWR_Configure_Check` / `PWR_On_Check`） | 沿用已有 Test Case 并扩展页面可见模式；原来的直接 Set 输出改为经前置检查再调用通用电源函数，所有既有调用显式传普通模式；新路径尚未实现/验证 |
| CAPL Function | 开启 LIN 并持续接收充电期间 SOC | `LIN_OpenNormal_Check()`、`Calc_Data_1.SOC` | 已有 CAPL Function 和信号；后续等待新帧，不能把单次读数当持续监测 |
| Await Value Match | 首次门槛：充电中等待 IBS SOC **>70%** | `Calc_Data_1.SOC >70`，超时参照 `SOC_StepTimeout_ms` | Test Case 内拟设原生 Await Value Match；SOC=70% 不通过，超时须停输出 |
| Await Value Match | 第二门槛：等待 DVM 实测电压 **>13.5 V** | `N8361::DVM_Voltage >13.5`，须检查测量有效性及超时 | Test Case 内拟设原生 Await Value Match；**仅在 SOC 已 >70% 后**检查；DVM=13.5 V 不通过 |
| Wait / 持续监测（待实现） | 从 DVM 首次 >13.5 V 起保持充电 25 min；持续采集 SOC、IBS 温度及 DVM | `1500000 ms` + `Calc_Data_1.SOC`、`Measured_Data.T_BATT`、`Status_Temp`、`N8361::DVM_Voltage` | Test Case 内拟用原生节点；单次 Wait 不等于持续监测；计时不因 SOC=100% 提前停止 |
| 联合判据（待实现） | 温压首次进入区域后每次有效采样均须合格至 25 min 结束；等待 SOC=100% 后每次新鲜采样均须保持 100% 至结束 | `10<=T_BATT<=60`、`Status_Temp=0`、图示温压上下界、`Calc_Data_1.SOC=100` | Test Case 内拟设原生 `while`/等待与 State Check；首次进入可发生在计时后期，但必须在 25 min 内出现；合格后退出区域、SOC 跌离 100% 或信号无效即失败 |
| CAPL Function（待安全验证） | 达到 25 min 或失败/中断时关闭充电输出并停止 LIN | `PWR_Off_Check()`、`LIN_Stop_Check()` | 已有 CAPL Function；异常路径必须关输出。电池保持接入用于静置；DVM 高于 1 V 时切换不再被拒绝，但不得用 `SAFE` 冒充“断电池、IBS 接通”的目标态 |
| Test Case | 充电结束后静置 4 h（Test 模式 1 min） | `WaitForSOCRestCalibration()`，取 `IBS::SOC_PointRest_ms` | **已有** Test Case，Normal 4 h / Test 1 min；静置期间不再充放电 |
| Test Case | 静置后检查 SOC_STATE=2，且 SOC 信号有效 | `CheckSOCStateCalibrated()` | **已有** Test Case，内部自行开启/停止 LIN；不能提前到充电结束时执行 |
| State Check / 记录步骤（待实现） | 在静置结束后的**同一轮新鲜采样**检查 SOC=100% 与 SOC_STATE=2，记录两项实际读数，供 90% 档比较 | `Calc_Data_1.SOC=100`、`SOC_STATE=2`；报告记录所读取的 SOC、SOC_STATE | 现有状态用例不报告具体 SOC 数值；拟设采集/记录节点，不能复用充电时旧读数；即便本轮失败也记录实测值，禁止进入下一档 |

### 每档 `AdjustRestPoint(TargetSOC)`（拟新增内联 Test Case，页面按 90/80/70/60/50% 展开）

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| CAPL Function / 读数（待实现） | 读取上档静置后的新鲜 SOC，与当前目标比较并记录 | `LIN_OpenNormal_Check()`、`Calc_Data_1.SOC`、`LIN_Stop_Check()`；页面变量 `ObservedSOC`、`TargetSOC`（均拟新增） | 已有 LIN Function 和信号；页面读数/保存尚待核实；无有效新帧即失败，不以旧值选充放电 |
| While（待实现） | 仅当 SOC !=目标且未到总时限及最大调节次数时，选择调节方向 | `ObservedSOC > TargetSOC` 放电；`ObservedSOC < TargetSOC` 充电；`ObservedSOC = TargetSOC` 跳出 | 拟在 Test Case 页面展开的原生循环/条件，**不是已有可调用封装**；总时限可复用 `SOC_StepTimeout_ms`，最大调节次数需拟增配置；达到上限判失败并关输出，禁止无限往复 |
| Test Case（条件分支） | SOC 高于目标时放电到自报 SOC `<=TargetSOC` | `DischargeBatteryToTargetSOC(SOC_DischargeVoltage_V,SOC_DischargeCurrent_A,TargetSOC,SOC_StepTimeout_ms)` | **已有** Test Case；仅在 `ObservedSOC > TargetSOC` 调用，可能越过目标 |
| Test Case（条件分支） | SOC 低于目标时充电到自报 SOC `>=TargetSOC` | `ChargeBatteryToFullSOC(SOC_ChargeVoltage_V,SOC_ChargeCurrent_A,TargetSOC,SOC_StepTimeout_ms,到目标即停,0)`（后两项拟增） | 已有 Test Case 的**拟扩展签名**；仅在 `ObservedSOC < TargetSOC` 调用，可能越过目标；既有直接 Set N8361 输出路径拟改用经验证的电池接入态前置检查和供电调用 |
| CAPL Function / State Check | 每次调节停输出后读新鲜 SOC；若越档，下一轮自动反向调节 | `LIN_OpenNormal_Check()` → 读取 `Calc_Data_1.SOC` 到拟设 `ObservedSOC` → `LIN_Stop_Check()` | 已有 LIN Function + 拟设页面读数；不得凭前一轮方向假设恰好等值；无新帧失败 |
| State Check | 检测此档 SOC **=TargetSOC**（90/80/70/60/50%）后才执行复位 | `Calc_Data_1.SOC=TargetSOC`（采用最后一次有效的新鲜读数） | Test Case 内拟设原生 State Check；超时/次数上限时失败，不把 `<=`/`>=` 当作 `=` |
| Test Table Function（拟增参数） | 按本用例配置断 IBS 电 60 s，再上电等 1 s | `Restart_IBS(IBS::SOC_FullChargeRestartOff_ms)`，**拟新增参数**值 60000 ms | 当前 `Restart_IBS()` 无入参；既有调用点改为明确传原 6000 ms，保持其他用例行为 |
| Test Case | 保持 IBS 接电池且不充放电，按旧工程时长静置 | `WaitForSOCRestCalibration()`，使用 `IBS::SOC_PointRest_ms` | **已有** Test Case；Normal 4 h / Test 1 min |
| Test Case | 静置后检查本档 SOC_STATE=2 | `CheckSOCStateCalibrated()` | **已有** Test Case；静置后的 SOC 不强制保持原目标值 |
| State Check / 记录步骤（待实现） | 静置结束后读取同一轮新鲜 SOC 与 SOC_STATE，记录实测值并供下一档选充放电 | `Calc_Data_1.SOC`、`SOC_STATE=2`；页面变量 `ObservedSOC`（拟新增） | 拟设页面采集/报告节点；原有状态用例只校验 SOC 有效和状态 2，未完整记录 SOC 实测数值 |

## 05 已确认条件与实施边界

- **已确认**继电器断 IBS 电 60 s 可代替本用例物理拔插；`Restart_IBS` 拟增加断电时长入参、本用例由拟增配置 `IBS::SOC_FullChargeRestartOff_ms=60000` 传参，原有调用点显式传 6000 ms，不改变旧用例时长。该参数与新签名仍不存在，页面方案确认前不建。
- **已确认**SOC >70% 后 DVM 首次 >13.5 V 为 25 min 起点；温压首次入区后须持续合格到 25 min 结束；SOC=100% 从首次达到保持到 25 min 结束（即使首次入区较晚也不额外延长）。停充静置 4 h 后，同一轮新鲜读数检查并记录 `SOC=100%`、`SOC_STATE=2`。采样须验证有效性和新鲜度，失效不能用最后一个合格旧值顶替。
- **已确认**每次静置后依据实测 SOC 与下一个目标的大小选择充/放电；两种现有 Test Case 只分别保证 `>=`/`<=`，因此需要在页面按每次新鲜读数反向修正直到 `=TargetSOC`，达到总时限或次数上限则判失败，不能无限调节。所需页面读数、记录节点及调节次数配置目前尚未验证。
- **充电用例修改方向**：扩展共享 `ChargeBatteryToFullSOC`，增加充电模式与保持时长；原用例调用显式选“到目标即停”，满充矫正选“目标门槛后保持 25 min 并持续温压/SOC 判据”。这可维持同一个 Test Case 供两种需求复用，但需修改所有现有调用点并编译验证。模式分支和参数尚未实现。
- **决定：删除 `PWR_Configure`/`PWR_On` 的“电池已接入即拒绝”**（检查 `BatteryConnectEquipment != 0`）。影响已逐项核查，现有流程均不依赖该拒绝：`SleepCurrent`、`WorkCurrent` 全程 `BatteryConnectEquipment=0`（`PHASE_Prepare` 切 IDLE `(0,0,0)`），原条件本就不触发；`PHASE_Prep_RelayIdle`/`PHASE_Done_RelaySafe` 只调用 `RELAY_Set`，不走这两个函数；`RELAY_SafeSwitch_Check`、`RELAY_Set_SAFE_Check`、`RELAY_Set_IDLE_Check` 全工程**无调用点**，仅定义；`ChargeBatteryToFullSOC`/`DischargeBatteryToTargetSOC` 当前直接原生 Set N8361，本来就不经过该拒绝。设定电压 10..15.5 V 与限流 0..11 A 校验保留，本用例另外增加“电池已接入、输出关闭时实测 10～15 V”的前置步骤。
- **决定：取消 `RELAY_Set` 的 1 V 切换门槛**（保留“输出命令已关”条件）。实际调用点只有两处：`PHASE_Prep_RelayIdle`（准备，此时电池未接入、DVM≈0）和 `PHASE_Done_RelaySafe`（收尾，其前一步 `PWR_WaitZero` 已按 `TB_DvmZeroTolerance_V=1.0 V`/1000 ms/3 次判回零）；正常流程两者本来就通过，故删除不影响流程。唯一行为变化在异常路径：DVM 未回零时原来 SAFE 切换被拒并记 `cleanup failed`，删除后会继续切继电器。`RELAY_SafeSwitch_Check` 内部另有 `PWR_WaitZero(TB_MaxSwitchVoltage_V,...)`，该函数当前无调用点，本次不改，若启用需同步。参数 `IBS::TB_MaxSwitchVoltage_V` 仍被 `VoltageAccuracyTest` 的页面节点引用，保留。
- **电压范围不能混淆**：当前 `IBS::TB_BatteryMin_V=10.0`、`IBS::TB_BatteryMax_V=15.5`，通用 `PWR_Configure/PWR_On` 核对的是 N8361 的**设定电压**，并未核对接入后的**实测电池电压**。本用例在电池接入、输出关闭时读取新鲜 DVM，只有 10～15 V 才允许开启充放电；15 V 判据不因通用参数 15.5 V 而放宽。
- **继电器写法**：不改 `RELAY_Set`，也不在项目里加前置判断；在 Test Table 内拟增内部 Function `RELAY_SetState(Battery,CAB1500,IBS)`，内部只有三个原生 `set`（加 `TB_RelaySettle_ms` 等待），后续流程中途改继电器一律调它。先例是已有 `Restart_IBS`，它就是 Test Table 内部 Function 直接写 `set`/`wait`。由此本用例的接线变成了 `RELAY_SetState(0,1,0)` → `RELAY_SetState(1,1,0)`，收尾前 `RELAY_SetState(0,1,0)`。
- **仍由既有流程负责的部分**：`PHASE_Prepare` 仍会切 IDLE、`PHASE_Complete` 仍会切 SAFE（`(0,1,1)`，会断 IBS）。因此断电池必须在 Completion 之前完成，且不能指望 SAFE 完成 `(0,1,0)`。`PWR_WaitZero`（1.0 V/1000 ms/3 次）在 Completion 内存在，断电池后 DVM 0.1～0.2 V 可通过。
- **该函数的代价**：因为按要求不带输出、DVM 前置条件，写到它就一定会改继电器命令，不再有软件层拦截；调用点必须自己保证顺序（输出已关、DVM 已记录）。这是本设计的已知取舍，不再作为待确认项。
## 06 实施记录（已按本文档落地）

### 06.1 已改文件

| 文件 | 改动 |
|---|---|
| `IBSTest/IBSTest.vparam` | 新建独立参数组 `SOC满充矫正法测试`，本用例参数全部归入该组，不再混入 `SOC自校准测试`：13 个判定类标量参数（供电前 10~15 V、SOC>70%、DVM>13.5 V、温压区域 4 个温度分界与 5 个电压边界）；3 个时间参数全部为 Mode 分列 —— `SOC_HoldSampleInterval_ms` 10000/1000、`SOC_FullChargeHold_ms` 1500000/60000（25 min/1 min）、`SOC_FullChargeRestartOff_ms` 60000/6000（60 s/6 s）。充放电限时与静置复用原 `SOC自校准测试` 组已有的 `SOC_StepTimeout_ms`、`SOC_PointRest_ms`（同为 Mode）。**对 HEAD 仅 27 行新增、0 行修改/删除，任何原有参数名与值均未变。** |
| `IBSTest/IBSFunctions.can` | 删除 `PWR_Configure`、`PWR_On` 中“电池已接入即拒绝”的判断；删除 `RELAY_Set` 的 DVM 1 V 切换门槛，保留“输出命令必须为 0”。设定电压/限流范围校验原样保留，README 注释同步更新。 |
| `IBSTest/IBSTest.vtt` | `Restart_IBS` 增加 `OffTime_ms` 入参，11 个原有调用点显式传 6000 ms；新增 `RELAY_SetState` 内部 Function；新增 6 个 Test Case；新增序列 `SOC_FullChargeCorrection` 并挂入“基本功能测试”组。 |

### 06.2 与第 04 节页面步骤的差异（为降低对已有用例的风险）

1. **未改动共享 `ChargeBatteryToFullSOC`**：不再给它加“模式/保持时长”参数，避免修改其全部既有调用点与内部步骤。首次满充改由新增 Test Case `SOC_FullChargeHold` 承担（内部用已有 `PWR_Configure_Check`/`PWR_On_Check` 供电，再由 `ChargeBatteryToFullSOC` 负责“到目标即停”的档位补充电）。共享充电/放电用例内部节点逐字未变。
2. **“低于目标充电”分支直接调用 `ChargeBatteryToFullSOC(TargetSOC)`**，即该用例原生的“到目标即停”语义，因此不需要模式参数。
3. **反向修正次数固定为 1 次**（每档共两轮调节），未加“最大调节次数”配置参数；避免引入无限往复循环与未使用的参数。
4. **温压区域按采样间隔离散判定**：`SOC_HoldSampleInterval_ms` 已设为 Mode（Normal 10000 ms / Test 1000 ms），但采样之间不构成连续证明；DVM 与 LIN 信号均无独立新鲜度计数器。

### 06.2.1 参数分组与 Mode 归属

| 参数组 | 参数 | 形态 |
|---|---|---|
| `SOC满充矫正法测试`（新建） | 13 个判据参数：`SOC_BatteryReadyMin_V` 10.0、`SOC_BatteryReadyMax_V` 15.0、`SOC_ChargeStartSOC_pct` 70、`SOC_DvmStartVoltage_V` 13.5、温压区域 `ChartTempMin_C` 10.0 / `ChartTempMid1_C` 25.0 / `ChartTempMid2_C` 40.0 / `ChartTempMax_C` 60.0、`ChartLowAt10C_V` 15.0、`ChartLowFloor_V` 13.5、`ChartHigh_V` 15.5、`ChartLowSlope_V_perC` 0.1、`ChartHighSlope_V_perC` 0.05 | ScalarSingleRecord，判据不进 Mode，避免调试时放宽 |
| 同上 | `SOC_HoldSampleInterval_ms`、`SOC_FullChargeHold_ms`、`SOC_FullChargeRestartOff_ms` | ScalarMultiRecord + `SelectorType [Mode]`，Normal/Test 两列 |
| `SOC自校准测试`（原有，未动） | `SOC_ChargeVoltage_V`、`SOC_ChargeCurrent_A`、`SOC_ChargeTargetSOC_pct`、`SOC_DischargeVoltage_V`、`SOC_DischargeCurrent_A`；`SOC_StepTimeout_ms`、`SOC_PointRest_ms`（Mode） | 共享给两套 SOC 校准用例，本次未改名、未移组、未改值 |

Mode 的取值绑定在测试单元级（`IBSProject.vtsoproj` 的 `EmbeddedTUVariantProperties` 中 `Mode`，当前为 `Normal`；`IBSProject.vvarprop` 中 `Mode.Modifiable=true`），因此新建参数组不影响既有 Mode 绑定。

### 06.3 已验证（静态）

- `.vtt` XML 结构合法；`ttroot` 版本/最低版本属性未变；5 个测试组、6 个序列定义、新序列引用与本组归属正确。
- 全部 146 个 `tcid` 唯一；`tttestcase`/`ttfunction`/`caplfunction` 引用全部可解析到既有定义与 `.can` 的 `export testfunction`。
- 新序列中 20 个 `<if>` 每个只含 1 个 Test Case；档位顺序为 90→80→70→60→50，等值判据参数与分支常量一一对应。
- `syspar::IBS::*` 与 `ChParScalar` 引用全部在 `.vparam` 中存在；`Measured_Data|52`（`T_BATT`、`Status_Temp`）与 `Calc_Data_1|53`（`SOC`、`SOC_STATE`）取自 `MAXUS_LIN_V3.ldf`。
- **已有用例零影响**：除 `Restart_IBS` 与 `SOC_RestCalibration` 外，4 个原有序列、7 个原有 Test Case、4 个原有 Function 的 XML 序列化内容与改前逐字相同；`SOC_RestCalibration` 与改前的唯一差异是 11 处显式的 `<const>6000</const>`。
- `.can` 大括号 95 对配平；三个文件编码（GBK/UTF-8+BOM）与换行风格未变，无替换字符。
- `.vparam` 对 HEAD 仅 27 行新增、0 行删除/修改：原有 7 个参数组、组内顺序与全部参数值保持原样；新增组内 66 个参数名无重复；3 个 Mode 行均为 `Auto` 类型且各含 Normal/Test 两个值。

### 06.4 编译与台架验证状态

1. **`.vtt` 与 `.can` 已通过一次真实构建**（14:42:39，`obj_IBSProject/d2c5homfeg7q.lastbuild`）：
   - `# Compilation succeeded (14:42:39) -- 0 errors, 0 warnings`（三个代码单元各一行）
   - `All Validation succeeded - continue build.` → `# Test unit created 'IBSTest.vtuexe'`
   - 解包该 `.vtuexe` 核对：包内 `IBSTest.vtt` 与当前文件逐字一致；包内 `IBSFunctions.can` 与当前文件在忽略一处注释横幅后完全一致（该横幅是被打包步骤剥掉的）
   - 因此**序列层 `<if>` 内含 Test Case 调用、新增 `RELAY_SetState`、`Restart_IBS(OffTime_ms)`、删除两处互锁，均已由编译器接受**。
2. **`.vparam` 分组与 Mode 调整发生在上次构建之后**，尚未被编译覆盖。改动相对 HEAD 仅 27 行新增、0 行修改，且结构与既有 `休眠平均电流测试`/`工作电流测试` 组完全同构，但需再跑一次 F6 复核；本工程无命令行编译通道，只能编辑器 F6。
3. **台架行为**：温压区域上下界仍是草案公式；DVM 采样新鲜度、`Status_Temp` 实际取值范围、断开电池后 DVM 0.1～0.2 V 均未在台架复核。
4. **安全项不变**：`(0,1,0)` 断开电池、`Restart_IBS` 60 s 断电、持续 25 min 充电均需台架确认；本用例在 Completion 之前自行断电池。

**状态：`.vtt`、`.can` 已编译通过（0 错误 0 警告）；`.vparam` 分组调整待一次 F6 复核；未台架验证。**
