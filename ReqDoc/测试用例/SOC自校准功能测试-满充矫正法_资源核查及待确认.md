# SOC自校准功能测试-满充矫正法：资源核查及待确认

状态：第一段资源核查完成；**页面步骤未设计、工程未修改**。依据 `ReqDoc/AGENTS.md` 2.1：缺少必要资源/判据时停止设计，确认后再给四列表格。

## 需求边界

`ReqDoc/原始需求文档.md` 6.8：真实蓄电池先按 GB/T 5008.1 处理至满充；断开 IBS 连接器 60 s 后接回；在满充以及 50%、60%、70%、80%、90% SOC 共六种状态下，先查 SOC/SOC_STATE 未校准，再充电使**电池端电压**高于按温度查表的门槛（文中写 >13.5 V）并**连续保持 25 min**，静置后检查 SOC_STATE 已校准。六档的 SOC 调整需要独立有效依据，不能仅将 IBS 自报 SOC 当作真实电池 SOC。

## 资源清单（实际文件，只读）

| 类别 | 当前工程可用资源 | 旧工程可参考、当前不能直接调用 |
|---|---|---|
| 参数 | `IBSTest/IBSTest.vparam`：`SOC自校准测试` 组有 `SOC_ChargeVoltage_V=14.8`、`SOC_ChargeCurrent_A=5.25`、`SOC_ChargeTargetSOC_pct=100`、`SOC_DischargeVoltage_V=10.5`、`SOC_DischargeCurrent_A=5.25`；`SOC_StepTimeout_ms=72000000/60000`、`SOC_PointRest_ms=14400000/60000`（Normal/Test）。`IBS_Case` 有 `TB_MaxSwitchVoltage_V=1.0`，`IBS_Reuse` 有 `TB_DvmZeroTimeout_ms=1000`。没有满充矫正专用温度阈值、25 min 连续保持或矫正后静置参数。 | `BatteryChargeDischarge.vparam` 的 `TC4_FullVoltageTimeout_ms=36000000/60000`、`TC4_FullHold_ms=1200000/60000`（**Normal 20 min，不是需求的 25 min**）。 |
| CAPL 可调用节点 | `IBSTest/IBSFunctions.can` 的 `export testfunction`：`LIN_OpenNormal_Check()`、`LIN_Stop_Check()`、`PWR_Configure_Check(float V, float Ichg, float Idchg)`、`PWR_On_Check()`、`PWR_Off_Check()`、`PWR_WaitZero_Check()`、`RELAY_SafeSwitch_Check(int state)`、`RELAY_Set_SAFE_Check()`、`RELAY_Set_IDLE_Check()` 等。 | 旧流程主要使用 Test Table 原生节点，不把旧工程同名 Function 当作当前 CAPL Function。 |
| Test Table Function | `IBSTest/IBSTest.vtt`：`PHASE_Prepare(string SequenceName)`、`PHASE_Complete()`、`Restart_IBS()`、`StartLog(string TestCaseName)`、`StopLog()`。`Restart_IBS` 实际断 IBS 供电 6 s，再上电等待 1 s，**不等同物理断开连接器 60 s**。 | 旧序列也调用了 `Restart_IBS`，时间仍与本需求不符。 |
| Test Case / Sequence | 当前有 `SOC_RestCalibration`（静置法 11 档）及 `ChargeBatteryToFullSOC`、`DischargeBatteryToTargetSOC`、`CheckSOCStateUncalibrated`、`CheckSOCStateCalibrated`、`WaitForSOCRestCalibration`。充放电目标取 IBS 自报 SOC；两种状态检查使用 LIN `Calc_Data_1` 的 SOC 有效范围 0～100、SOC_STATE 0/1 或 2。**没有**当前工程的满充矫正 Test Case/Sequence 或 25 min 连续电压监视封装。 | `IBS_BaseTest/IBS_BaseTest.vtt` 有 `Test_SOCFullChargeCorrection`，仅单次：13.6 V/10 A，DVM >13.4 V 后等待 `TC4_FullHold_ms`（Normal 20 min），然后查 SOC_STATE=2；不是六档流程，等待期间无连续阈值监视，也无静置后再查。 |
| 系统变量/信号 | `IBSFunctions.can` 实际引用 `@sysvar::N8361::DVM_Voltage`、`Set_OutPutVoltage`、`Set_ChargeCurrent`、`Set_DicChargeCurrent`、`Set_OutputSts`；`@sysvar::Power_RelayCrtl::BatteryConnectEquipment`、`CAB1500_PowerCtrl`、`IBS_PowerCtrl`，`@sysvar::LIN::LINMsg_RxCounter` 等。当前 VTT 中 `Calc_Data_1` 的 `SOC`、`SOC_STATE` 有实用例。**没有经确认的温度信号、温度门槛表、独立电池端电压测点、独立真实 SOC 测点。** | 旧序列用 `N8361::DVM_Voltage` 当电压门槛测点，未验证它就是蓄电池端电压。 |
| 固定模板 | 当前序列 Preparation：`PHASE_Prepare("序列名")`；Completion：`PHASE_Complete()`。两者字段和顺序不可替换成旧模板。 | 旧序列 Preparation=`StartLog`+`RelaySet`，Completion=停 LIN+关电源+继电器安全态+停日志，与当前模板不一致。 |

## 与需求不符的关键点

1. 旧实现 `DVM >13.4 V`、保持 20 min，而需求写 `电池端 >13.5 V（按温度查表）`、**连续** 25 min；单个 `wait` 后查状态不能证明整个 25 min 电压始终达标。
2. 旧 `Restart_IBS` 仅断供电 6 s，不能直接代替物理断开连接器 60 s；“上电后休眠”也没有可直接证明的现有判据。
3. `ChargeBatteryToFullSOC` 和 `DischargeBatteryToTargetSOC` 用 IBS 自报 SOC 到位；这不能证明 GB/T 5008.1 满充或 50%～90% 真实电池 SOC。旧单点序列没有六档复用 Test Case。
4. 原文 6.8.5 说维持 25 min 后读取状态，步骤 5 另有“静置后再次读取”，但未给静置时长和停充/接线条件。
5. 旧序列启动 N8361 输出后，等待 DVM 首次超过门槛，再等待 20 min；保持期间未持续监视电压，不能直接宣称“电池端连续高于门槛 25 min”。

## 需要确认后才能输出页面四列表格

1. 请提供电池温度来源、温度到电压门槛的查表数据，以及**电池端测点**如何采集；或明确允许仅在指定温度范围内按固定 `>13.5 V` 和 `N8361::DVM_Voltage` 作替代测点，并将其列为台架待验证风险。
2. GB/T 5008.1 满充与五档真实 SOC（50%～90%）由谁/什么设备确认？若只以 IBS 自报 SOC 到位，请明确接受“仅作功能流程检查，不宣称真实 SOC/标准符合性”。
3. 断连接器 60 s 必须人工物理操作，还是允许 `IBS_PowerCtrl` 断供电 60 s 代替（仅作为断电复位，不声称物理拔插）？矫正后“静置”要持续多久、何时关闭充电输出？

确认这些关键边界后，再复用当前已有的 SOC 检查和充放电 Test Case，按 `Command | Caption | 调用对象 | 封装` 四列给出六档执行顺序。此文件只记录核查，不构成可直接执行的测试用例。未实施，尚未编译或台架验证。
