# 6.3 电压精度测试：VTT 页面设计（资源核查阶段，待确认）

## 01 需求与判据

依据《原始需求文档》6.3：精度＜0.1%的电压表红/黑表笔分别接蓄电池正/负极；同步读取 IBS 输出电压 V1 和电压表电压 V2，取得 5 组完整数据。逐组计算 `E=(V1-V2)/V2*100%`，5 组均须满足 `-0.25% <= E <= +0.25%`（等价于 `|E| <= 0.25%`）。用户最新指定同一块电池连续采 5 组，**每组采 3 次、每次间隔 2 s**。暂按每组开始后在 2/4/6 s 取 3 对 V1/V2，五组连续约 30 s、共 15 对；此时每组不是先前暂定的 10 s 窗口。每组分别计算三对数据的相对偏差最小值和最大值，两个极值均落在 ±0.25% 内才算通过。用户还提出积分平均电压，积分平均的实现口径及其是否用于判定尚待确认，不替代原需求逐组判据。

任何一次 `V2=0` 或 V1/V2 失效、超时，都应判该组数据不足，不能挑剩余样本算通过；报告逐组保留三次 V1、V2、E、偏差极值、平均值与最终结论。**极值是三次配对偏差的极值**，不能分别取 V1 的最大值、V2 的最小值拼成一对。积分平均定义为有效连续样本的 `∫V(t)dt / 测量时长`；仅每 2 s 锁存一对值不足以证明已经完成连续积分，需要确认两路原始数据的时间戳/更新机制与积分算法。

## 02 已核实的当前工程资源（只读）

| 类别 | 实际资源与边界 |
|---|---|
| 参数 | `IBSTest.vparam` 现有 `IBS_Reuse`、`IBS_Phase`、`IBS_Case`、`休眠平均电流测试`、`工作电流测试`、`SOC自校准测试` 六组；没有电压精度专用参数、`0.25%` 容差参数或五组采样配置。`IBS::WC_UbattTolerance_V=0.5` 属工作电流反馈检查，不能复用作本精度判据。 |
| CAPL 可调用节点 | `IBSFunctions.can` 中已导出 `LIN_OpenNormal_Check()`、`LIN_Stop_Check()`、`PWR_Configure_Check(float V, float Ichg, float Idchg)`、`PWR_On_Check()`、`PWR_Off_Check()`、`RELAY_SafeSwitch_Check(int state)` 等；没有读取外部精度电压表或成对采集 V1/V2 的 `export testfunction`。完整导出项以该 `.can` 原文件为准。 |
| Test Table | 当前 `IBSTest.vtt` 的 Test Sequence：`SleepCurrentTest`、`WorkCurrentTest`、`FramePhaseCheck`、`SOC_RestCalibration`；Test Case：`SleepCurrent`、`WorkCurrent`、`ChargeBatteryToFullSOC`、`DischargeBatteryToTargetSOC`、`CheckSOCStateUncalibrated`、`CheckSOCStateCalibrated`、`WaitForSOCRestCalibration`；Test Table Function：`PHASE_Prepare(string SequenceName)`、`PHASE_Complete()`、`StartLog`、`StopLog`、`Restart_IBS`。没有可复用的电压精度 Test Case。`WorkCurrent` 已封装电源设定、到压、LIN 反馈与电流积分，不能拆开当成独立电压精度流程。 |
| 电压读数 | 用户确认 V2 使用 N8361 外接线 DVM 的 `N8361::DVM_Voltage`，测量 IBS 线路电压；当前 `.can` 确实引用 `@sysvar::N8361::DVM_Voltage`。V1 使用 LDF 中 `LIN / MAXUS_LIN_V3 / IBS / Measured_Data / U_BATT`（帧 ID 0x34，起始位 0，14 bit，电压 V = raw/1024+3，16383 表示 Invalid）。当前 `WorkCurrent` 的原生节点已引用 `LIN::ResetUBattV`，但当前 `.can` 未引用该系统变量；本次 BLF 证明 LIN 帧里有数据，不证明在线变量脚本在每次运行时持续刷新。N8361 DVM 精度＜0.1%及测点与蓄电池端子一致尚无证明，按用户要求暂按成立处理并列入风险。 |
| 其他系统变量 | 当前 `.can` 还引用 `@sysvar::N8361::Set_OutPutVoltage`、`Set_ChargeCurrent`、`Set_DicChargeCurrent`、`Set_OutputSts`、`@sysvar::LIN::LINMsg_RxCounter` 等；不将电源设定值作为 V2。 |
| 固定模板与继电器 | 当前序列 Preparation：`PHASE_Prepare(SequenceName)`，Completion：`PHASE_Complete()`，不改内部字段和调用顺序。Preparation 关输出并切 IDLE，参数元组为电池/CAB1500/IBS=`(0,0,0)`；因此 CAB1500 默认接通。Completion 停 LIN、关输出、等 DVM 回零再切 SAFE=`(0,1,1)`。本测试测量目标命令为 `(1,1,0)` 且 `N8361::Set_OutputSts=0`。`RELAY_SafeSwitch_Check`/`RELAY_Set` 限制 Battery=0，不能用来切入目标元组；必须在电池接入前、DVM 无压及输出关闭时单独断开 CAB1500。 |
| 旧工程 | 已核对旧 `IBS_BaseTest.vtt`：没有电压精度序列或 Test Case；`U_BATT` 只用于等信号可用，不存在五组 V1/V2 精度计算的现成封装。 |

## 03 页面上目前可确认的部分步骤

V1/V2 的来源已明确：`Measured_Data.U_BATT` 与 `N8361::DVM_Voltage`。用户确认测量时断开 CAB1500 避免其影响 DVM 测量，接入同一块真实电池供 IBS 工作，N8361 电源保持不输出。每组按 2 s 间隔锁存 3 对同期有效的 IBS 帧与 DVM 读数，共五组；不能重用上次缓存值。用户提出封装一个 Test Case，在 Test Sequence 中分第一组至第五组分别调用。**该 Test Case 当前尚不存在**，下表将其作为拟新增的页面设计单独标记，不宣称是已可调用的工程资源；待用户确认页面步骤后才能实施。现有资源能确认接线与准备/收尾，积分数据通路仍需核实。

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Preparation | 准备测试环境 | `PHASE_Prepare(SequenceName)`；待确认序列名后传入 | 已有 Test Table Function，固定模板不变；退出时电池=0、CAB1500=0、IBS=0，电源输出命令=0 |
| Test Case（页面内联） | 切换到电压精度测试接线状态 | 本序列内联 Test Case，内部四个节点见下表 | 不做可复用 Test Case/Function 封装；页面内直接展开节点 |
| CAPL Function | 开启 LIN Normal 调度并等首帧 | `LIN_OpenNormal_Check()` | 已有 CAPL Function，供 `Measured_Data.U_BATT` 采样；首帧并非五组数据判定 |
| Test Case（拟新增） | 第一组：连续 3 次，每隔 2 s 采一对电压、判偏差极值 | 拟新增 `VoltageAccuracyGroup`，组标识“第一组”；V1=`Measured_Data.U_BATT`，V2=`N8361::DVM_Voltage` | 拟新增 Test Case，**尚不存在，不可调用**；内部页面步骤见下表 |
| Test Case（拟新增） | 第二组：连续 3 次，每隔 2 s 采一对电压、判偏差极值 | 拟新增 `VoltageAccuracyGroup`，组标识“第二组” | 同一拟新增 Test Case，尚不存在 |
| Test Case（拟新增） | 第三组：连续 3 次，每隔 2 s 采一对电压、判偏差极值 | 拟新增 `VoltageAccuracyGroup`，组标识“第三组” | 同一拟新增 Test Case，尚不存在 |
| Test Case（拟新增） | 第四组：连续 3 次，每隔 2 s 采一对电压、判偏差极值 | 拟新增 `VoltageAccuracyGroup`，组标识“第四组” | 同一拟新增 Test Case，尚不存在 |
| Test Case（拟新增） | 第五组：连续 3 次，每隔 2 s 采一对电压、判偏差极值 | 拟新增 `VoltageAccuracyGroup`，组标识“第五组” | 同一拟新增 Test Case，尚不存在 |
| Set | 测量结束后先断开真实电池 | `Power_RelayCrtl::BatteryConnectEquipment=0` | 原生 Set；正常退出必须先执行，切 SAFE 前需 DVM 回零 |
| Completion | 完成测试并恢复安全态 | `PHASE_Complete()` | 已有 Test Table Function，固定模板不变；若电池未断开或 DVM 不回零，内部 SAFE 会被互锁阻止，需处理异常退出 |

序列中内联接线 Test Case 的**页面可见步骤（不调用额外封装函数，均未实施）**：

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| State Check | 确认电源输出关闭且电池未接入 | `N8361::Set_OutputSts=0`、`Power_RelayCrtl::BatteryConnectEquipment=0` | Test Case 内原生 State Check；检查命令值而非触点实测 |
| Await Value Match | 等待 DVM 低于继电器切换阈值 | `N8361::DVM_Voltage` 相对 0 V，阈值 `IBS::TB_MaxSwitchVoltage_V` | Test Case 内原生 Await Value Match；切 CAB1500 前执行 |
| Set | 在电池未接入时断开 CAB1500，保持 IBS 支路接通 | `Power_RelayCrtl::CAB1500_PowerCtrl=1`，`Power_RelayCrtl::IBS_PowerCtrl=0` | Test Case 内原生 Set；CAB1500 常闭继电器 1 为断开 |
| Set | 接入真实电池给 IBS 供电 | `Power_RelayCrtl::BatteryConnectEquipment=1` | Test Case 内原生 Set；目标 `(1,1,0)`，不打开 N8361 输出 |

拟新增 `VoltageAccuracyGroup` 内部的**页面步骤设计（均未实施）**：

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Wait | 本组第 1 次：等待 2 s | 2 s | Test Case 内原生 Wait |
| 采样（待核实） | 本组第 1 次：锁存同一时刻有效电压 | `Measured_Data.U_BATT` 与 `N8361::DVM_Voltage`；记录 V1、V2、时间戳 | Test Case 内采样节点待验证，**无现成接口** |
| Wait + 采样（待核实） | 本组第 2 次：间隔 2 s，锁存有效电压 | 2 s；第 2 对 V1/V2 | Test Case 内 Wait 为原生节点；采样接口待验证 |
| Wait + 采样（待核实） | 本组第 3 次：间隔 2 s，锁存有效电压 | 2 s；第 3 对 V1/V2 | Test Case 内 Wait 为原生节点；采样接口待验证 |
| 计算（待设计） | 计算 3 次配对偏差、偏差最大/最小值与两路平均电压 | `E_i=(V1_i-V2_i)/V2_i*100%`，`E_min`、`E_max` | Test Case 内页面步骤； |
| State Check（拟新增） | 判本组 3 次偏差均在 ±0.25% 内 | `E_min >= -0.25%` 且 `E_max <= +0.25%` | Test Case 内原生 State Check（依赖已验证的结果变量），任一次无效则该组失败 |

五个组调用同一个拟新增 Test Case，各组报告独立保留 3 对 V1/V2、3 个 E、极值、平均值、PASS/FAIL。**极值判定示例**：若本组 3 次配对偏差分别是 `+0.10%`、`-0.20%`、`+0.27%`，则最小偏差 `-0.20%` 达标，最大偏差 `+0.27%` 超出 `+0.25%`，本组 FAIL。比较最小值和最大值只是把“三次偏差都合格”写成两个边界检查，并不是只选最好和最坏的电压值计算一次偏差。`DVM_Voltage` 不能用作 CAB1500 接通时的合格精度参考。精度限值 0.25% 不进入 Mode 分列。

## 04 请确认后继续设计

1. 实施前需核查当前 CANoe 中 `LIN::ResetUBattV` 的实际更新、DVM 采样刷新及两路数据时间对齐；BLF 只能证明录制期间 `Measured_Data.U_BATT` 有值，不能证明在线系统变量或 DVM 的实时采样精度。

   答：只要打开 LIN 调度表，肯定有值

### 风险与本次 BLF 核查

- **用户暂时接受的假设**：将 N8361 外接 DVM 的 `N8361::DVM_Voltage` 当作 V2，并暂时默认其精度＜0.1%、测点符合蓄电池端子要求；目前无仪器精度证书和接点核验证据。这两项是测试判据可信度风险，投入正式验收前必须核对，不以 BLF 的 IBS 信号读数代替证明。
- **CAB1500 干扰及接线风险**：用户指出 CAB1500 接通会影响 DVM 电压精度，测量必须 CAB1500=1（断开），IBS=0（接通），Battery=1（接入），N8361 输出=0。继电器位与输出命令的读回不等同于触点位置和真实无输出；需要台架确认 CAB1500 隔离生效，DVM 探头与 IBS 所测节点确实指向同一被测电压。
- **异常退出风险**：当前 `PHASE_Complete()` 先等 DVM 回零、再调用要求 Battery=0 且低压的 `RELAY_Set(SAFE)`；若测试中断发生在 Battery=1 期间，正常断电池 Set 可能未执行，收尾无法保证断开电池或切 SAFE。原生 Set 直接操作电池继电器也不受 `RELAY_Set` 软件互锁保护。只读设计不能宣称异常安全退出已解决；实施前需确定测试失败/中断仍执行断电池的可靠路径，并核实断开后 DVM 实际回零及现场安全操作。
- `D:/20261123_181550_006.blf`（80,192 字节）中找到 LIN_MESSAGE2 的 `0x34`、DLC 8 的 `Measured_Data` 共 62 帧；按上述 LDF 解出 `U_BATT` 62 个非无效值，首帧原始 9428 → 12.20703125 V，末帧 9203 → 11.9873046875 V，范围 **11.5341796875～12.44140625 V**，平均 **11.97004158 V**。全部 62 帧 ERROR_Common、ERROR_IDENT、Resp_Error、FLAG_INCONSISTENCY 位均为 0；该数据在 12 V 左右，但**不是恒定 12.000 V**。
- 本次只解读 BLF 中的 IBS LIN 原始帧；尚未从该记录提取与 62 帧严格同期的 DVM V2，因此不能计算 6.3 的 0.25% 精度结论。该 BLF 的 U_BATT 有约 0.907 V 跨度，实际配对需核查稳态与时间同步，不能以均值代替每组判定。

**状态：同一电池，拟新增一个 Test Case 复用为五组，每组三对数据、间隔 2 s；10 s 旧要求是否取消及积分平均口径待确认。仪表精度及接点仍是待验证风险；读数成对锁存与异常安全退出尚未解决。未修改 VTT/vparam/CAPL，未编译，未台架验证。**
