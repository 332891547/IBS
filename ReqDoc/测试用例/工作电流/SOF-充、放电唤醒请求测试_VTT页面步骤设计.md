# SOF-充、放电唤醒请求测试：VTT 页面步骤设计（待确认）

## 01 范围与用户确认

依据《原始需求文档》6.11，充电、放电方向各测试至少 5 轮。用户确认：充电设压 `min(U0+2.0 V,14.0 V)`，放电设压 `max(U0-2.0 V,10.5 V)`；复用现有 VTT 中 `_Statistics::LIN1::Wakeups` 读法；停 LIN 后，`CAB1500_500::AnalogCurrent` 在 0～18 mA 内发生滤波后近似 0→17 或 17→0 mA 的方向跳变，且 LIN 总线上无报文，即视为 IBS 休眠。CAB1500 通常持续上报，偶发断流不能拿初始化的 0 mA 充当跳变；IBS 内部定时器使休眠电流最高可到 8 mA。通常 56 s 睡眠、8 s 自动唤醒只是行为背景，**不添加“持续多少帧”判据**；自动唤醒本身不发送 LIN 唤醒帧，充放电使能或低 SOC 才会产生唤醒帧。页面保留采样时间、电流前后值和 LIN 计数。U0 达到 14.5 V 即停止测试；14.5 V 是用户指定的保守停止上限，并非该型号电池的满电静置电压规格。

本文件仅是**待确认页面伪代码**；目前不存在完整 SOF 用例或休眠判定封装。下面标“拟新增”的调用对象仅为设计占位，**不是已存在的 API/可立即执行的节点**；不修改 VTT、CAPL、参数。需先确认第 04 节缺失资源，获准后才可实施。

## 02 资源清单（现有工程）

| 类别 | 已核实资源与默认值 | 限制 |
|---|---|---|
| 固定模板 | VTT 中 `PHASE_Prepare(string SequenceName)`、`PHASE_Complete()` | Preparation / Completion 原样调用，不改字段、顺序或内部 |
| 已有 Test Case / Sequence | `SleepCurrent(OutPutVoltage)`、`SOCWU_LowSOCWakeup(Threshold_pct)`、`SOCWU_LowSOCWakeStatic` 等；无 SOF 充放电唤醒 Test Case / Sequence，也无“90 s 内休眠跳变”封装 | `SleepCurrent` 是 20 min 电流积分，`SOCWU_LowSOCWakeup` 含 SOC 配置、30 min + 3.7 h 窗口，均不能直接替代本用例；只参考其页面节点模式 |
| 已有 CAPL 可调用节点 | `.can` 中 `export testfunction LIN_OpenNormal_Check()`、`LIN_Stop_Check()`、`PWR_Configure_Check(float V,float Ichg,float Idchg)`、`PWR_On_Check()`、`PWR_Off_Check()`、`PWR_WaitZero_Check()`、`RELAY_SafeSwitch_Check(int state)` | 现有电源封装验证设压 8～15.5 V、充/放电限流 0～11 A；不能凭空假定其能验证真实电池接线 |
| 已有参数 | `.vparam`：`IBS_Reuse` 中 `IBS::TB_LinStopSettle_ms=100`、`TB_LinOpenTimeout_ms=2000`；`IBS_Case` 中 `TB_BatteryMin_V=8.0`、`TB_BatteryMax_V=15.5`；`休眠平均电流测试` 中 `SC_VoltageTimeout_ms=5000`、`SC_VoltageTolerance_V=0.5` | 本需求专用重复次数、1 A 双向限流、>150 mA 阈值、U0 停止上限及电流跳变容差均无已有参数；按用户确认在页面写定值，勿误用其他用例参数 |
| 信号与测量 | LDF `IBS_Frame4` 中 `SOCWU_Ena`、`ChargeCurrWU_Ena`、`DisChargeCurrWU_Ena`、`ChargeCurrWU_Treshold`、`DisChargeCurrWU_Treshold`；`Calc_Data_1` 中 `ChargeCurrWU_Sts`、`DisChargeCurrWU_Sts`、`ChargeCurrWU`、`DisChargeCurrWU`、`SOCWU_Sts` | 按用户确认 `SOCWU_Ena=0`、两个充放电使能均为 1、两侧阈值统一为 160 mA（严格 >150 mA）且不关闭。LDF 编码：充电 `raw×10 mA`，160 mA 对应 raw=16；放电 `raw×2+10 mA`，160 mA 对应 raw=75 |
| 电流与活动证据 | 台架 `.vsysvar` 中 `CAB1500_500::AnalogCurrent` 单位 mA，由 `CAB1500_IP` 报文滤波换算更新；`CAB1500_500::CANMsg_RxCounter` 由同一接收逻辑递增；现有 VTT 已读取 `_Statistics::LIN1::Frames`、`_Statistics::LIN1::Wakeups` | 前两者在 `.can` 尚无实际引用，**不符合 AGENTS.md 以 `.can` 实际引用作为现有系统变量清单的严格口径**；只能列为实物已发现、工程调用待验证的候选，不能在实施前宣称可调用 |
| 电源与继电器 | `.can` 已引用 `@sysvar::N8361::DVM_Voltage`、`Set_OutputSts`、`Set_OutPutVoltage`、`Set_ChargeCurrent`、`Set_DicChargeCurrent`、`@sysvar::Power_RelayCrtl::BatteryConnectEquipment`、`CAB1500_PowerCtrl`、`IBS_PowerCtrl` | 用户确认接入真实电池后关模拟器输出仍可从 DVM 读取 U0，CAB1500 持续上报；充放电双向限流均为 1 A |

## 03 页面步骤（已落入 VTT，编译及台架验证待完成）

当前执行序列保留固定 Preparation、五个依次执行的独立单轮 Test Case、固定 Completion。五个页面节点均调用参数化 `SOFWakeChargeDischargeOnce(RoundIndex=1..5)`；每次各执行一次充电和放电，完整执行本次的电池接入与断开收尾。原有五轮循环版 `SOFWakeChargeDischarge` 定义完整保留，但不挂入当前执行树，供后期大量循环测试使用。下方每方向步骤适用于单轮用例与保留的循环版。原拟新增 `WaitIBSSleep` Test Table Function 不能向 Case 返回通过/失败状态；90 s 采样和安全门控直接展开在 Case 页面节点中。

### Test Tree

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Preparation | 准备 SOF 充放电唤醒测试环境 | `PHASE_Prepare("SOF_ChargeDischargeWake")` | 已有 Test Table Function；固定模板 |
| Test Case × 5 | SOF 充、放电唤醒请求测试：第一次至第五次 | 五次分别调用 `SOFWakeChargeDischargeOnce(RoundIndex=1..5)`；每次内部页面步骤如下 | 五个独立 Test Case 实例，共用单轮定义；旧 `SOFWakeChargeDischarge` 五轮循环定义保留但不在此序列执行 |
| Completion | 停 LIN、关输出、恢复安全态 | `PHASE_Complete()` | 已有 Test Table Function；固定模板不变 |

### Test Case 内：公共准备与轮次

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| CAPL Function | 关闭电池模拟器输出 | `PWR_Off_Check()` | 已有 CAPL Function；放在聚合 Test Case 内 |
| Set / State Check | 接入电池并读取 U0 | 真实电池接入；`N8361::DVM_Voltage → U0`；`U0≥14.5 V` 停测，9～14 V 才满足原需求区间 | 原生 Set + State Check；U0 为拟新增页面局部变量 |
| Set | 配置充、放电唤醒 | `IBS_Frame4::SOCWU_Ena=0`、`ChargeCurrWU_Ena=1`、`DisChargeCurrWU_Ena=1`；`ChargeCurrWU_Treshold=160 mA`（raw=16）、`DisChargeCurrWU_Treshold=160 mA`（raw=75） | 原生 Set；充放电使能保持为 1，两侧阈值均严格 >150 mA |
| While | 单轮 Case 内执行一次充电段、放电段 | 第一次至第五次各自依次执行下表充电和放电；每次出入口重新检查电压，方向不成立则记录未覆盖，不无限循环凑轮次 | 单轮 Test Case 内原生一轮循环/计数节点；保留的旧定义仍按五轮循环，不额外创建包住流程的 CAPL 函数 |

### Test Case 内：每个方向的页面步骤

每轮按充电再放电执行本表；“本方向”分别取充电、放电，不把放电流程折叠成一个不可见调用。每个方向重新读取 U0、记录独立的 Wakeups 基线；电池仍接入，模拟器在本方向开始时保持关闭。

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Set / State Check | 读取本方向 U0 并计算目标电压 | `N8361::DVM_Voltage → U0`；充电 `Uout=min(U0+2 V,14 V)`；放电 `Uout=max(U0-2 V,10.5 V)`；`U0≥14.5 V` 停测 | 原生 Set + State Check、少量 CAPL Inline 算术；U0/Uout 为拟新增局部变量 |
| State Check | 确认目标确实形成充电或放电 | 充电须 `Uout>U0`，放电须 `Uout<U0`；否则记录未覆盖并结束本次判定，不进入本方向后续步骤且不计有效轮次 | 原生 State Check；不会把无电压差或方向相反的结果算成功 |
| CAPL Function / Wait | 开 LIN 正常调度并发送唤醒配置至少 2 s | `LIN_OpenNormal_Check()`，`Wait(≥2000 ms)`；发送公共准备中的 `IBS_Frame4` 配置 | 已有 CAPL Function + 原生 Wait；每方向停 LIN 前确保配置已发送 |
| CAPL Function | 关闭 LIN 调度并记活动基线 | `LIN_Stop_Check()`；记录 CAB1500 帧计数、LIN `Frames` 基线 | 已有 CAPL Function + 原生记录；模拟器输出保持关闭 |
| While / CAPL Inline / Wait | 90 s 内确认本方向 IBS 休眠 | CAB1500 接收计数增长才读取滤波电流；相邻两个新采样在 0～18 mA 内形成 ≤4 mA↔≥14 mA 跳变；LIN `Frames` 不增长 | 聚合 Case 内可见的原生循环与 1000 ms Wait，记录前后值和时间；判据结果直接门控后续输出；定时器 8 mA 不能充当高态，超时或 LIN 帧增长时不施加输出 |
| CAPL Function | 预设本方向输出电压和双向限流 | `PWR_Configure_Check(Uout, 1 A, 1 A)`，输出仍关闭 | 已有 CAPL Function；用户确认充、放电双向限流均为 1 A |
| Wait / Set | 睡眠后额外等待 5 s，记录本方向唤醒基线 | `Wait(5000 ms)`；读 `_Statistics::LIN1::Wakeups`、`_Statistics::LIN1::Frames` | 原生 Wait + Set；本方向单独记录基线 |
| While / Wait / State Check | 输出未开启的 200 s 内不得收到 LIN 唤醒帧 | `_Statistics::LIN1::Wakeups` 保持等于本方向基线，LIN 调度停止 | 原生节点；定时器自动唤醒不发送 LIN 唤醒帧 |
| CAPL Inline / CAPL Function | 记录唤醒基线后开启模拟器输出 | 开启前记录 `_Statistics::LIN1::Wakeups`，再调用 `PWR_On_Check()`；开输出命令完成后开始 60 s 窗口 | 已有 CAPL Function + 页面内 Inline；避免开输出瞬间的唤醒被基线吞掉 |
| Await Value Match / While | 60 s 内收到本方向 LIN 唤醒请求 | `_Statistics::LIN1::Wakeups` 相比开启输出时的基线增加 | 原生等待与判定；一旦增加立即恢复 LIN，不等满 60 s |
| CAPL Inline / CAPL Function / Wait | 恢复 LIN，收到新报文后等待 2 s | 恢复前记录 `LIN::ResetCalc1Counter`，调用 `LIN_OpenNormal_Check()` 并确认计数增长，再等待 2000 ms | 已有 CAPL Function + 原生 Wait；计数仅在新有效 `Calc_Data_1` 帧时增长，不沿用停表前缓存；`LIN_OpenNormal_Check()` 自带等帧，现有接口不能读该首帧的精确时间戳 |
| State Check | 核对本方向唤醒标记 | 充电：新帧 `Calc_Data_1::ChargeCurrWU_Sts=1`、`ChargeCurrWU=1`；放电：新帧 `DisChargeCurrWU_Sts=1`、`DisChargeCurrWU=1` | 原生 State Check；恢复后新有效报文满 2 s 才读取最新帧 |
| Wait | 继续保持 LIN 通讯至共 10 s | `Wait(8000 ms)` | 原生 Wait；与上段 2 s 合计维持 10 s |
| CAPL Function | 结束本方向并复位观察条件 | `LIN_Stop_Check()`、`PWR_Off_Check()` | 已有 CAPL Function；确认输出关闭后进入下一方向/轮次 |

聚合 Test Case 正常完成或提前退出循环后，均先确保停 LIN、关闭模拟器输出，再按现有真实电池用例的原生 Set 写 `Power_RelayCrtl::BatteryConnectEquipment=0`，确认 DVM 回零，然后进入原样的 `PHASE_Complete()`。这是用户确认的必要安全收尾：真实电池不断开时固定 Completion 中的 `PWR_WaitZero_Check()` 无法通过；此步骤不改变五轮有效性、休眠或唤醒判据。若执行在用例体内异常中断、无法到达该步骤，须人工确认电池接线和安全状态，不得声称已安全收尾。

## 04 仍影响实施的原有边界

1. **休眠数据与构建待验证：**不新增 `WaitIBSSleep`，上述相邻新采样 0↔17 mA 跳变直接在 Case 内观察并门控。`CAB1500_500::AnalogCurrent` 和 `CANMsg_RxCounter` 来源于台架变量及接收脚本，但本工程 `.can` 未实际引用；VTT 的变量解析与台架实测仍待 vTESTstudio F6 编译和硬件验证，不得将静态 XML 可解析视为已验证。
2. **原有电压方向边界：**按 `Uout=min(U0+2 V,14 V)`，U0 达 14 V 时充电目标不高于 U0；按 `Uout=max(U0-2 V,10.5 V)`，U0 为 9 V 时放电目标反高于 U0。此类轮次只记录未覆盖，不得算作已完成的五轮有效唤醒；如需覆盖这两个电压端点，须另定目标设压规则。原需求规定 U0 为 9～14 V，而用户另定 `U0≥14.5 V` 停测；14～14.5 V 区间如何计入原需求合格范围，实施时仍按原文 9～14 V 判定，不擅自扩大合格范围。
3. **型号资料与停止上限：**公开[同型号产品信息](https://www.qipeixinxi.com/supply/detail/id/93462)可核对型号，但未提供“满电静置电压”规格；采用用户指定的 14.5 V 停止上限，不推断这是电池满电电压。

**验证：**仅更新页面设计文档；未编译、未执行台架、未修改 VTT/CAPL/参数。拟新增节点仍待页面确认后实施。
