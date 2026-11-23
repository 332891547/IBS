# SOC自校准功能测试-静置法：VTT 页面设计（待确认，未实施）

## 01 需求与范围

依据《原始需求文档》6.2：真实蓄电池按旧工程设压/限流方案充至 IBS 报告 SOC=100%，逐档放电至 IBS 报告 SOC 达目标值；每档先复位 IBS，再核对静置前 SOC_STATE=0/1，按旧工程静置条件等待，静置后核对 SOC_STATE=2。满充档 + 90%→0% 十档共 11 档。用户确认用 IBS 自报 SOC 作充放电到位依据；这不构成 GB/T 5008.1 规定的独立满充验证，也不证明电池的真实 SOC。

本文件只设计页面步骤供确认，不修改参数、CAPL、VTT 或 CANoe；旧工程资源仅是参考，不等于已移入当前测试单元。

## 02 资源清单（只读核查）

| 类别 | 当前工程资源 | 旧工程可参考资源；当前**不可直接调用** |
|---|---|---|
| 参数 | `IBSTest.vparam` 现有 `IBS_Reuse`、`IBS_Phase`、`IBS_Case`、休眠平均电流测试、工作电流测试组；**无** SOC 静置参数 | `BatteryChargeDischarge.vparam` 的 `IBS::ChargeVoltage_V=14.8`、`ChargeCurrent_A=5.25`、`ChargeTargetSOC_pct=100`、`DischargeVoltage_V=10.5`、`DischargeCurrent_A=5.25`、`ChargeDischargeTimeout_ms` Normal/Test=`72000000/60000`、`PointRest_ms` Normal/Test=`14400000/60000`（旧值非本次批准参数） |
| CAPL Function | `LIN_OpenNormal_Check()`、`LIN_Stop_Check()`、`PWR_Configure_Check(float V, float Ichg, float Idchg)`、`PWR_On_Check()`、`PWR_Off_Check()`、`PWR_WaitZero_Check()`、`RELAY_SafeSwitch_Check(int state)`；均为当前 `IBSFunctions.can` 的 `export testfunction` | 旧 SOC 流程主要用 Test Table 封装，不能将其名称当作当前 CAPL Function |
| Test Table Function | 当前 `PHASE_Prepare(string SequenceName)`、`PHASE_Complete()`、`StartLog`、`StopLog` | 旧 `Restart_IBS`，内部断电 6 s、上电后等待 1 s |
| Test Case / Sequence | 当前只有 `SleepCurrent`、`WorkCurrent`、`FramePhaseCheck` 等；**无** SOC 测试用例 | 旧 `Test_SOC_RestCalibration_11Points`；共享 Test Case：`ChargeBatteryToFullSOC`、`DischargeBatteryToTargetSOC`、`CheckSOCStateUncalibrated`、`WaitForSOCRestCalibration`、`CheckSOCStateCalibrated` |
| 系统变量及 LIN 信号 | 当前 `.can` 已引用 `@sysvar::LIN::LINMsg_RxCounter`、`@sysvar::N8361::DVM_Voltage`、`@sysvar::Power_RelayCrtl::BatteryConnectEquipment` 及电源/继电器命令变量；当前 VTT **尚无** SOC/SOC_STATE 绑定。`IBSProject.vtsoproj` 指向实际存在的 `MAXUS_LIN_V3.ldf`：`LIN / MAXUS_LIN_V3 / IBS / Calc_Data_1` (ID 53) 的 `SOC`（8 bit，0～100%，255 Invalid）与 `SOC_STATE`（2 bit，0/1/2/3 分别为偏差 >15%、<15%、<10%、Invalid）。项目文件引用并不等于当前 CANoe 实时接收已验证 | 旧 VTT 同样绑定 `Calc_Data_1` 的 SOC/SOC_STATE；旧检查用例将未校准判为 0/1、校准判为 2，与 LDF 数值定义一致，但 LDF 描述的是偏差档而非“是否完成校准”的字面定义 |
| 固定阶段 | 当前序列的 Preparation 固定为 `PHASE_Prepare(SequenceName)`，Completion 固定为 `PHASE_Complete()`，内部调用顺序不变 | 旧序列的 Preparation 是 `StartLog`+`Restart_IBS`，Completion 是停 LIN+关输出+停日志；**不可照搬** |

旧工程来源：`D:/WorkContent/tsmaster/IBS_TMP/02_TestEngineeringCode/03_IBSTest_CANoe/02_IBS_VTestStudioConfig/IBS_BaseTest/IBS_BaseTest.vtt` 与同目录 `BatteryChargeDischarge.vparam`。旧序列在 VTT 第 2256 行开始，共 11 档；旧状态检查共享用例在约 3736、3825 行。用户确认沿用旧 Normal 静置 14400000 ms（4 h）及每档 `Restart_IBS`（断电 6 s、恢复供电后等待 1 s）；旧充放电等待上限 72000000 ms（20 h）。充电设定 14.8 V/5.25 A，放电设定 10.5 V/5.25 A；用户所记“10 V”与旧参数 10.5 V 不符，本设计按已核实的旧参数 10.5 V 记录，若要改为 10 V 须明确确认。SOC_STATE=0/1→2 的测试判据沿用旧用例，其物理定义按本工程 LDF 所列偏差档解释。

## 03 页面步骤（待确认，当前尚不可执行）

目标结构沿用旧工程共享 Test Case，不把其内部逻辑拆为内联实现；“旧工程封装”不表示当前 VTT 已有该节点。固定 Preparation/Completion 不改内部步骤；按用户要求在 Preparation 后以原生 Set 接入电池，不增加复杂异常分支；正常 Completion 前原生 Set 断开电池。充放电目标按 IBS SOC 判断；每档先复位，再检查未校准，静置后检查已校准。旧充放电 Test Case 内部也写 Battery=1，移入时须检查重复接通命令的影响。

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Preparation | 准备测试环境 | `PHASE_Prepare("SOC_RestCalibration")` | 当前 Test Table Function；固定模板，不改内部字段或顺序 |
| Set | Preparation 后接入真实电池 | `Power_RelayCrtl::BatteryConnectEquipment = 1` | 原生 Set，绕过当前 `RELAY_Set` 的软件互锁；仅设计步骤，台架接线/设备侧保护未验证 |
| Test Case | 按旧工程充电设置使 IBS SOC 达 100% | `ChargeBatteryToFullSOC(ChargeVoltage_V=14.8, ChargeCurrent_A=5.25, ChargeTargetSOC_pct=100, ChargeDischargeTimeout_ms)` | **旧工程** Test Case，当前缺失；仅 IBS 自报 SOC 到位，非 GB/T 5008.1 独立满充验证 |
| Test Table Function | 满充档：复位 IBS（断电 6 s，再上电等 1 s） | `Restart_IBS` | **旧工程** Test Table Function，当前缺失；复位后才检查未校准 |
| Test Case | 满充档：读取 SOC、核对 SOC_STATE 未校准 | `CheckSOCStateUncalibrated` | **旧工程** Test Case，当前缺失；旧判据为 SOC 有效且 SOC_STATE=0/1 |
| Test Case | 满充档：静置 4 h | `WaitForSOCRestCalibration` | **旧工程** Test Case，当前缺失；Normal `PointRest_ms=14400000` |
| Test Case | 满充档：静置后读取 SOC、核对 SOC_STATE 已校准 | `CheckSOCStateCalibrated` | **旧工程** Test Case，当前缺失；旧判据 SOC_STATE=2 |
| Test Case | 放电至目标档（90%、80%……0%） | `DischargeBatteryToTargetSOC(DischargeVoltage_V=10.5, DischargeCurrent_A=5.25, TargetSOC, ChargeDischargeTimeout_ms)` | **旧工程** Test Case，当前缺失；以 IBS 自报 SOC 达目标停止；0% 档需电池放电安全验证 |
| Test Table Function | 该档先复位 IBS（断电 6 s，上电后等 1 s） | `Restart_IBS` | **旧工程** Test Table Function，当前缺失；用户确认复位会回到未校准状态，实际状态仍由下一步验证 |
| Test Case | 该档读取 SOC、核对 SOC_STATE 为 0/1 | `CheckSOCStateUncalibrated` | **旧工程** Test Case，当前缺失；移入时仅调整调用顺序，不重复实现内部检查 |
| Test Case | 该档静置 4 h | `WaitForSOCRestCalibration` | **旧工程** Test Case，当前缺失；Normal `PointRest_ms=14400000` |
| Test Case | 该档静置后读取 SOC、核对 SOC_STATE 为 2 | `CheckSOCStateCalibrated` | **旧工程** Test Case，当前缺失；上一组五步按 90%、80%……0% 各执行一次 |
| Set | 正常结束后断开真实电池 | `Power_RelayCrtl::BatteryConnectEquipment = 0` | 原生 Set；按用户要求不加异常分支，正常路径以外不保证执行；物理切换条件未验证 |
| Completion | 完成测试并恢复安全态 | `PHASE_Complete()` | 当前 Test Table Function；固定模板，不改内部字段或顺序；其 DVM 回零/SAFE 切换须先满足安全条件 |

旧序列 `11Points` 名称与日志标签 `10Points` 不一致；迁入时统一名称。旧版每档先查 0/1 再复位；根据用户确认的“重启 IBS 后变为未校准”，本方案只把已有 `Restart_IBS` 的调用移至 `CheckSOCStateUncalibrated` 前，保留原有 Test Case 判据和内部步骤。

## 04 已确认与仍待解决

1. **已确认文件绑定：**`IBSProject.vtsoproj` 引用实际存在的 `MAXUS_LIN_V3.ldf`；`Calc_Data_1` 中 `SOC` 和 `SOC_STATE` 路径存在，数值定义已列资源清单。尚未进行 CANoe 在线收帧/IBS 固件行为验证。
2. **已确认设计选择：**旧工程 14.8 V 充电、10.5 V 放电、5.25 A 限流；以 IBS SOC 判断 100% 及各目标档；每档 `Restart_IBS`、静置 Normal 4 h。10 V 与旧参数 10.5 V 不一致；本方案先用旧值 10.5 V。GB/T 5008.1 的独立满充判定不在现有封装内，报告不能宣称已按该标准验证满充。
3. **继电器互锁的操作边界：**当前 `RELAY_Set` 仅允许 SAFE/IDLE 且强制 Battery=0，`PHASE_ValidateParams` 也禁止把 SAFE/IDLE 的电池位改成 1。用户选择不改该函数；在页面使用原生 Set 直接写 `Power_RelayCrtl::BatteryConnectEquipment=1`，确实**绕过这一层 CAPL 软件互锁**，与旧充放电用例内部写法一致，但不代表继电器驱动、台架物理互锁或切换安全已通过验证。用户要求不加复杂异常流程；正常路径写 0 断开，提前中断时可能保持接通，实施前须由台架负责人确认可接受，不能称为安全收尾。
4. **已确定状态顺序：**每档先 `Restart_IBS`，然后检查 0/1，静置后检查 2；复位后是否实际返回 0/1 由页面 Test Case 在台架判定。0% 档按 IBS SOC 停止不保证电池不过放；仍需确认真实电池最低允许电压和保护方式。
5. **实施结果（2026-11-23）：**已按本文四列步骤写入当前工程。当前 VTT 原无旧 SOC 共享用例，本次按旧工程判据新建；`PWR_Configure_Check`/`PWR_On_Check` 在 `BatteryConnectEquipment != 0` 时会拒绝执行，故充放电用例改用原生 `set` 节点写 N8361 设定与输出（与旧工程写法一致），未改动既有 CAPL 函数。旧工程充放电用例内部的 CAB1500=1、IBS=0 继电路由一并保留。详见第 05 节。

## 05 实施记录

**参数（`IBSTest.vparam`，GBK）：**新增分组 `SOC自校准测试`。`ScalarSingleRecord`：`IBS::SOC_ChargeVoltage_V=14.8`、`SOC_ChargeCurrent_A=5.25`、`SOC_ChargeTargetSOC_pct=100`、`SOC_DischargeVoltage_V=10.5`、`SOC_DischargeCurrent_A=5.25`；判据类目标值保持单记录，不进 Mode 分列。`ScalarMultiRecord`+`SelectorType [Mode] Normal/Test`：`IBS::SOC_StepTimeout_ms=72000000/60000`、`IBS::SOC_PointRest_ms=14400000/60000`，与旧工程一致。项目级 `IBSProject.vvarprop` 的 `Mode` 已 `Modifiable=true`，测试单元 `EmbeddedTUVariantProperties` 已绑定 `Mode`（起始值 Normal=0），故无需新增变体声明。

**结构（`IBSTest.vtt`，UTF-8 BOM）：**
- 测试树新增分组 `SOC 自校准测试` → 测试序列 `SOC_RestCalibration`。
- `ts_definition` 共 57 步：Preparation `PHASE_Prepare("SOC_RestCalibration")` → 接电池 → 充电 → 11 档（每档复位、查未校准、静置、查已校准）→ 断电池 → Completion `PHASE_Complete()`；固定模板内部字段与顺序未改。
- 新增 5 个共享 `tc_definition`：`ChargeBatteryToFullSOC`(4 参)、`DischargeBatteryToTargetSOC`(4 参)、`CheckSOCStateUncalibrated`、`CheckSOCStateCalibrated`、`WaitForSOCRestCalibration`。
- 新增 `function_definition Restart_IBS`：`IBS_PowerCtrl` 置 1（断电）→ 等 6000 ms → 置 0（上电）→ 等 1000 ms。
- 两处电池通断步骤包在 `<tc>` 节点内（旧工程无“序列体直接 `<set>`”先例，`<tc>` 内 `<set>` 有 7 处先例），因此页面上显示为测试步骤节点。

**判据与信号：**`Calc_Data_1` 的 `SOC`、`SOC_STATE` 走 DBSignal 路径，未校准判 0/1（`range`），已校准判 `eq 2`，与旧工程及 LDF 定义一致。

**静态校验结果：**XML 可解析；`0xFFFD`=0；`caplfunction` 17 个全部存在于 `IBSFunctions.can`；参数引用 24 个全部在 `.vparam`；`ttfunction`/`tttestcase` 引用全部有定义；`tcid` 75 个无重复；`tttestcase` 实参与形参个数一致；vparam 内 3 个 `ScalarMultiRecord` 块所有数据行均为 5 列（Name/Type/Info/Normal/Test）。

**编译与验证：**`obj_IBSProject/d2c5homfeg7q.lastbuild` 显示本次 VTT 改动已随 17:34:17 的构建通过——原文：`# Compilation succeeded (17:34:17) -- 0 errors, 0 warnings`，并 `# Test unit created '...\IBSTest.vtuexe'`。这同时验证了 `Calc_Data_1` 的 DBSignal 路径编号与所有节点结构可用。参数改为 Mode 变体的时间为 17:37:17，晚于该次构建，**该参数改动尚未编译**。

**未验证：**直接写 `BatteryConnectEquipment` 绕过 CAPL 软件互锁、0% 档过放、异常中断不断电池等仍按第 04 节第 3、4 项处理；未见台架执行记录。

**状态：VTT 已编译通过（0 errors/0 warnings）；vparam 的 Mode 变体改动待再按 F6 验证；台架未执行。**
