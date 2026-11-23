# SOC自校准功能测试-静置法：VTT 页面设计（待确认，未实施）

## 01 需求与范围

依据《原始需求文档》6.2：按 GB/T 5008.1 将真实蓄电池处理至满充，读取 IBS 的 SOC 与 SOC_STATE，静置前应未校准、按 IBS 规定条件静置后应校准；再对 0%、10%……90% 十个档位重复。总计 100% 满充档 + 10 个目标档。真实电池的满充判定、各档实际 SOC 的独立确认以及静置条件，原文未给出可直接执行的设备接口或数值。

本文件只设计页面步骤供确认，不修改参数、CAPL、VTT 或 CANoe；旧工程资源仅是参考，不等于已移入当前测试单元。

## 02 资源清单（只读核查）

| 类别 | 当前工程资源 | 旧工程可参考资源；当前**不可直接调用** |
|---|---|---|
| 参数 | `IBSTest.vparam` 现有 `IBS_Reuse`、`IBS_Phase`、`IBS_Case`、休眠平均电流测试、工作电流测试组；**无** SOC 静置参数 | `BatteryChargeDischarge.vparam` 的 `IBS::ChargeVoltage_V=14.8`、`ChargeCurrent_A=5.25`、`ChargeTargetSOC_pct=100`、`DischargeVoltage_V=10.5`、`DischargeCurrent_A=5.25`、`ChargeDischargeTimeout_ms` Normal/Test=`72000000/60000`、`PointRest_ms` Normal/Test=`14400000/60000`（旧值非本次批准参数） |
| CAPL Function | `LIN_OpenNormal_Check()`、`LIN_Stop_Check()`、`PWR_Configure_Check(float V, float Ichg, float Idchg)`、`PWR_On_Check()`、`PWR_Off_Check()`、`PWR_WaitZero_Check()`、`RELAY_SafeSwitch_Check(int state)`；均为当前 `IBSFunctions.can` 的 `export testfunction` | 旧 SOC 流程主要用 Test Table 封装，不能将其名称当作当前 CAPL Function |
| Test Table Function | 当前 `PHASE_Prepare(string SequenceName)`、`PHASE_Complete()`、`StartLog`、`StopLog` | 旧 `Restart_IBS`，内部断电 6 s、上电后等待 1 s |
| Test Case / Sequence | 当前只有 `SleepCurrent`、`WorkCurrent`、`FramePhaseCheck` 等；**无** SOC 测试用例 | 旧 `Test_SOC_RestCalibration_11Points`；共享 Test Case：`ChargeBatteryToFullSOC`、`DischargeBatteryToTargetSOC`、`CheckSOCStateUncalibrated`、`WaitForSOCRestCalibration`、`CheckSOCStateCalibrated` |
| 系统变量及 LIN 信号 | 当前 `.can` 已引用 `@sysvar::LIN::LINMsg_RxCounter`、`@sysvar::N8361::DVM_Voltage` 及电源/继电器命令变量；**无** `@sysvar::...SOC` / `SOC_STATE` 引用。当前 VTT 也无 SOC/SOC_STATE 的 DBSignal 绑定 | 旧 VTT 经 `MAXUS_LIN_V3` 的 `Calc_Data_1` DBSignal 读取 `SOC`、`SOC_STATE`；仅旧工程存在并不证明当前 CANoe 已加载同一 LDF |
| 固定阶段 | 当前序列的 Preparation 固定为 `PHASE_Prepare(SequenceName)`，Completion 固定为 `PHASE_Complete()`，内部调用顺序不变 | 旧序列的 Preparation 是 `StartLog`+`Restart_IBS`，Completion 是停 LIN+关输出+停日志；**不可照搬** |

旧工程来源：`D:/WorkContent/tsmaster/IBS_TMP/02_TestEngineeringCode/03_IBSTest_CANoe/02_IBS_VTestStudioConfig/IBS_BaseTest/IBS_BaseTest.vtt` 与同目录 `BatteryChargeDischarge.vparam`。旧序列在 VTT 第 2256 行开始，共 11 档；旧状态检查共享用例在约 3736、3825 行。旧流程将未校准判为 `SOC_STATE=0/1`、已校准判为 `2`，这是**旧项目实现**，需以当前 IBS 软件/LDF 状态定义确认。旧静置 4 h、充放电等待 20 h 也仅为旧 Normal 参数，不能擅自当作本次 IBS 静置要求。

## 03 页面步骤（旧工程流程参考，当前尚不可执行）

以下仅复述旧工程已有 Test Case 的页面结构；“旧工程封装”不表示当前 VTT 可选到该节点。缺少当前资源时停止设计，不把原用例拆成新的内联实现。

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Preparation | 准备测试环境 | `PHASE_Prepare("SOC_RestCalibration")` | 当前 Test Table Function；沿用固定模板，具体电池接线/继电器状态待确认 |
| Test Case | 按 GB/T 5008.1 将蓄电池处理至满充 | `ChargeBatteryToFullSOC(ChargeVoltage_V, ChargeCurrent_A, ChargeTargetSOC_pct, ChargeDischargeTimeout_ms)` | **旧工程** Test Case，当前缺失；旧实现按 IBS SOC 达目标停止，不等于 GB/T 5008.1 满充验证 |
| Test Case | 满充档：静置前读取 SOC、核对 SOC_STATE 未校准 | `CheckSOCStateUncalibrated` | **旧工程** Test Case，当前缺失；旧判据为 SOC 有效且 SOC_STATE=0/1 |
| Test Table Function | 满充档：复位 IBS（旧流程动作，当前待确认） | `Restart_IBS` | **旧工程** Test Table Function，当前缺失；旧做法断电 6 s 后上电等 1 s |
| Test Case | 满充档：按 IBS 条件静置 | `WaitForSOCRestCalibration` | **旧工程** Test Case，当前缺失；旧参数为 `PointRest_ms` |
| Test Case | 满充档：静置后读取 SOC、核对 SOC_STATE 已校准 | `CheckSOCStateCalibrated` | **旧工程** Test Case，当前缺失；旧判据 SOC_STATE=2 |
| Test Case | 将真实蓄电池调到目标 SOC 档位 | `DischargeBatteryToTargetSOC(DischargeVoltage_V, DischargeCurrent_A, TargetSOC, ChargeDischargeTimeout_ms)` | **旧工程** Test Case，当前缺失；旧实现依赖 IBS 自报 SOC 触发停止 |
| Test Case | 每档静置前读取 SOC、核对 SOC_STATE 未校准 | `CheckSOCStateUncalibrated` | **旧工程** Test Case，当前缺失；复用封装，不重复其内部逻辑 |
| Test Table Function | 每档复位 IBS（旧流程动作，当前待确认） | `Restart_IBS` | **旧工程** Test Table Function，当前缺失；直接切换继电器的旧实现不可直接移植 |
| Test Case | 每档按 IBS 条件静置 | `WaitForSOCRestCalibration` | **旧工程** Test Case，当前缺失；`PointRest_ms` |
| Test Case | 每档静置后读取 SOC、核对 SOC_STATE 已校准 | `CheckSOCStateCalibrated` | **旧工程** Test Case，当前缺失；对 90%、80%……0% 各重复上一组四步 |
| Completion | 完成测试并恢复安全态 | `PHASE_Complete()` | 当前 Test Table Function；沿用固定模板，失败时也执行 |

旧序列在每档“静置前检查”和“静置等待”之间调用 `Restart_IBS`（IBS 断电 6 s、上电 1 s）；表中仅作旧流程记录，**不是当前工程已批准动作**。尤其旧序列先检查未校准（0/1）才复位：前一档刚判校准（2），下一档可能在复位前卡住；旧 `Restart_IBS` 直接切继电器，也未符合当前安全互锁。旧序列的 `11Points` 名称与日志标签 `10Points` 不一致。`DischargeBatteryToTargetSOC` 旧工程按 90%→0% 执行；需求列 0%→90% 是档位集合，实际顺序需确认。

## 04 实施前必须确认

1. 当前 CANoe 实际加载的 LDF/网络中，`SOC` 与 `SOC_STATE` 的可读路径和状态枚举分别是什么？旧 `Calc_Data_1` 信号路径及 0/1→2 编码是否适用于当前 IBS？
2. 真实蓄电池的 GB/T 5008.1 满充、0%～90% 各档位的**独立**到位依据是什么？旧用例仅等待 IBS 自报 SOC，可能以被测输出证明被测输出；满充不能仅凭 `SOC=100` 代替标准程序。
3. 当前 IBS 的静置条件是什么（供电/负载/LIN 调度状态、静置时长、温度），各档是否必须 `Restart_IBS`？旧 4 h 参数只是参考。
4. 当前阶段 `PHASE_Prepare` 会关输出并切 IDLE，`PHASE_Complete` 会回零并切 SAFE；两者是否适用于真实蓄电池已接入的场景？未确认前不可照搬/执行旧充放电动作。旧充放电封装、SOC 检查封装目前不在当前 VTT，需确认移植范围及实际接口后另行提出实施方案。

**状态：设计草案，因当前工程缺少 SOC 读数/状态判据、真实电池到位与静置条件及共享 Test Case，页面流程不可执行，尚未编译或台架验证。请先确认以上事项，再提交可实施的四列表供最终批准。**
