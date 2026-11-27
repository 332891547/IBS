# SOC自校准功能测试-静置法：VTT 页面步骤设计（待确认）

## 01 需求及边界

依据《原始需求文档》6.2：先将真实蓄电池处理至满充，再于满充档及 0%、10%……90% 十档分别确认静置前 SOC_STATE 未校准、按 IBS 条件静置后 SOC_STATE 已校准。当前工程已实现一版 `SOC_RestCalibration`，本稿按实际可调用资源重新列出页面步骤供确认；**只写设计文档，不修改测试工程，不代表 GB/T 5008.1 满充、编译或台架验证通过**。

当前工程以 IBS 自报 SOC 判断充电达到 100%、放电到目标；按满充 → 90% → 80% → … → 0% 的物理放电顺序执行，覆盖原需求列出的十一档，但不是需求文字列举的 0% → 90% 顺序。若要求逐字按升序执行，需要每档重新充电，并重新评估测试时间和电池安全；不得把现有逐级放电流程称为升序执行。

## 02 资源清单（从当前工程核查）

| 类别 | 已有资源及默认值 | 使用边界 |
|---|---|---|
| 参数 | `IBSTest.vparam` 的 `SOC自校准测试` 组：`IBS::SOC_ChargeVoltage_V=14.8`、`SOC_ChargeCurrent_A=5.25`、`SOC_ChargeTargetSOC_pct=100`；`SOC_DischargeVoltage_V=10.5`、`SOC_DischargeCurrent_A=5.25`；`SOC_StepTimeout_ms` Normal/Test=`72000000/60000` ms；`SOC_PointRest_ms` Normal/Test=`14400000/60000` ms | 20 h 为单档充/放电到位上限，4 h 为每档静置时间；Test 模式的 1 min 不能用于完整性能验收 |
| Test Sequence | `SOC_RestCalibration` | 现有序列已按 100%、90%……0% 展开，`breakonfail=true`；不得重复新建同名序列 |
| Test Case | `ChargeBatteryToFullSOC(ChargeVoltage_V, ChargeCurrent_A, ChargeTargetSOC_pct, ChargeDischargeTimeout_ms)`；`DischargeBatteryToTargetSOC(DischargeVoltage_V, DischargeCurrent_A, DischargeTargetSOC_pct, ChargeDischargeTimeout_ms)` | 现有封装用 N8361 原生 Set 设定及控制输出，LIN 新帧上的 `Calc_Data_1::SOC >= 100` / `<= 目标值` 到位后关输出、停 LIN；不重复拆开内部逻辑 |
| Test Case | `CheckSOCStateUncalibrated()`、`WaitForSOCRestCalibration()`、`CheckSOCStateCalibrated()` | 前后状态检查均自行启动 LIN Normal 获取信号并停 LIN；分别检查有效 SOC 0–100 与 SOC_STATE=0/1、等待 `SOC_PointRest_ms`、检查有效 SOC 与 SOC_STATE=2 |
| Test Table Function | `PHASE_Prepare(string SequenceName)`、`PHASE_Complete()`、`Restart_IBS(int OffTime_ms)` | 使用既有固定 Preparation / Completion，不变更模板；当前调用 `Restart_IBS(6000)`，其内部关 IBS 供电、等 6 s、恢复供电、等 1 s |
| CAPL 可调用节点 | `LIN_OpenNormal_Check()`、`LIN_Stop_Check()`、`PWR_Configure_Check(float,float,float)`、`PWR_On_Check()`、`PWR_Off_Check()`、`PWR_WaitZero_Check()`、`RELAY_SafeSwitch_Check(int)`，均为 `IBSFunctions.can` 的 `export testfunction` | 本页面步骤优先调用现有 Test Case；不能把已有封装拆成 CAPL Function 重做 |
| 系统变量 / LIN 信号 | `IBSFunctions.can` 已引用 `@sysvar::N8361::Set_OutputSts`、`Set_OutPutVoltage`、`Set_ChargeCurrent`、`Set_DicChargeCurrent`、`DVM_Voltage`、`@sysvar::Power_RelayCrtl::BatteryConnectEquipment`、`CAB1500_PowerCtrl`、`IBS_PowerCtrl`；现有 VTT 绑定 `Calc_Data_1::SOC`、`SOC_STATE` | `BatteryConnectEquipment=1` 接入真实电池，`=0` 断开；SOC_STATE 的 0/1/2 判断沿用现有 Test Case，不能仅由该状态断言物理 SOC 准确性 |
| 固定模板 | 现有序列 Preparation 调 `PHASE_Prepare("SOC_RestCalibration")`、Completion 调 `PHASE_Complete()` | 不增删模板字段、不改变其内部步骤；现有序列在二者之间有接入/断开电池的原生 Set |

## 03 页面步骤（供确认；不是实施指令）

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Preparation | 准备测试环境 | `PHASE_Prepare("SOC_RestCalibration")` | 已有 Test Table Function；固定模板 |
| Set | 接入真实蓄电池 | `Power_RelayCrtl::BatteryConnectEquipment=1` | 现有序列原生 Set；设备保护及继电器互锁见第 04 节 |
| Test Case | 将电池充至 IBS 报告 SOC 100% | `ChargeBatteryToFullSOC(SOC_ChargeVoltage_V, SOC_ChargeCurrent_A, SOC_ChargeTargetSOC_pct, SOC_StepTimeout_ms)` | 已有 Test Case；复用整套充电与到位判断，不等同 GB/T 5008.1 独立满充 |
| Test Table Function | 满充档：复位 IBS | `Restart_IBS(6000)` | 已有 Test Table Function；断电 6 s、恢复后等 1 s |
| Test Case | 满充档：检查静置前状态 | `CheckSOCStateUncalibrated()` | 已有 Test Case；有效 SOC、SOC_STATE 为 0 或 1 |
| Test Case | 满充档：按 IBS 条件静置 | `WaitForSOCRestCalibration()` | 已有 Test Case；Normal 4 h，保持 IBS 供电；静置环境条件仍需台架确认 |
| Test Case | 满充档：检查静置后状态 | `CheckSOCStateCalibrated()` | 已有 Test Case；有效 SOC、SOC_STATE 为 2 |
| Test Case | 下一档：放电到 IBS 报告的目标 SOC | `DischargeBatteryToTargetSOC(SOC_DischargeVoltage_V, SOC_DischargeCurrent_A, TargetSOC, SOC_StepTimeout_ms)`；`TargetSOC` 按 90、80、70、60、50、40、30、20、10、0 各调用一次 | 已有 Test Case；十档为现有序列逐条调用，不新增循环或另造放电逻辑 |
| Test Table Function | 本档：复位 IBS | `Restart_IBS(6000)` | 已有 Test Table Function；每档到位后执行 |
| Test Case | 本档：检查静置前状态 | `CheckSOCStateUncalibrated()` | 已有 Test Case；复位后检查有效 SOC、SOC_STATE 为 0 或 1 |
| Test Case | 本档：静置 | `WaitForSOCRestCalibration()` | 已有 Test Case；Normal 4 h；LIN 由封装检查节点自行启动/停止 |
| Test Case | 本档：检查静置后状态 | `CheckSOCStateCalibrated()` | 已有 Test Case；有效 SOC、SOC_STATE 为 2；上一组五行对十个目标档依次重复 |
| Set | 正常路径断开真实蓄电池 | `Power_RelayCrtl::BatteryConnectEquipment=0` | 现有序列原生 Set；不是异常退出保障 |
| Completion | 完成测试并恢复安全态 | `PHASE_Complete()` | 已有 Test Table Function；固定模板，不改内部 |

## 04 确认项与风险

1. **满充判据差异：**原需求要求按 GB/T 5008.1 处理至满充；现有 `ChargeBatteryToFullSOC` 仅等待 IBS 自报 SOC 达 100%，没有独立电池满充验收证据。若要求严格符合 6.2.1，须先提供/确认 GB/T 5008.1 操作和独立验收记录；不能由 IBS SOC 自证真实满充。
2. **继电器与异常收尾：**当前序列直接 Set 接/断真实电池，绕过 `RELAY_Set` 的 CAPL 软件互锁；既有充放电用例还会设置 `CAB1500_PowerCtrl=1`、`IBS_PowerCtrl=0`。序列 `breakonfail=true`，末尾断电池 Set 只位于正常路径；失败或中断时不能保证执行。台架负责人需确认物理互锁、掉电状态与人工/硬件紧急断开措施后才能执行。
3. **0% 档安全：**以 IBS 自报 SOC<=0 停放电，没有独立欠压/最低允许电池电压保护判据；需要电池型号、最低允许电压和台架保护策略，未核实前不得进行 0% 实机放电。
4. **静置条件：**`SOC_PointRest_ms=14400000` 仅验证等待时长，不会自动证明温度、负载及休眠条件满足 IBS 静置要求；需明确台架配置和记录方式。11 档仅静置时间就至少 44 h，另计充放电与复位。
5. **实施边界：**本稿不修改既有 `IBSTest.vtt`、`IBSTest.vparam`、`IBSFunctions.can`；原有实施记录见同目录 `SOC自校准功能测试-静置法_VTT页面步骤.md`。本稿未编译、未在台架执行；待用户确认页面顺序及以上安全/判据差异后，才讨论是否修改工程。
