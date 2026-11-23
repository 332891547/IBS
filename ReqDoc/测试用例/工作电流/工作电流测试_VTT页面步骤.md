# 工作电流测试：VTT 页面方案（已实施，编译通过）

## 01 需求与边界

依据 `../原始需求文档.md` 第 6.1 节：IBS 安装在 Vbat 电源上，环境 25 ℃ ±10 ℃，烧录最新版软件；10、11、12、13、14 V 各测一次。每点设置电源电压及 1 A 限流，开启输出后 2 s 内到达目标电压；正常 LIN 通讯后，IBS 的 LIN 电压反馈在 1 s 内接近 Vbat；清零积分并连续采集 10 min，计算平均工作电流，要求 **<25 mA**。每点结束关输出后再进行下一点。

原始需求没有定义“接近”的数值容差、限流是充电方向还是充放电两个方向、LIN 电压反馈的 1 s 起点，也没有定义上电至开始积分的稳定时间。以下不自行填入这些判据。原文称“不需要真实电池、CANoe”，但当前 VTT 工程的 LIN 通讯与 CAB1500 积分依赖 CANoe 测量配置；不能把“原文不需要 CANoe”视为本工程已经具备脱离 CANoe 的运行能力。

## 02 资源清单（只读核查）

| 类别 | 已有资源与当前值 | 本用例用途 / 限制 |
|---|---|---|
| 参数组 `IBS_Reuse` | `IBS::TB_LinOpenTimeout_ms=2000`、`IBS::TB_LinFrameTarget=5`、`IBS::TB_DvmZeroTolerance_V=1.0`、`IBS::TB_DvmZeroTimeout_ms=1000` | 已有 LIN 启动与收尾参数；不能拿回零容差充当到压容差 |
| 参数组 `IBS_Phase` | `IBS::RelayIdle=(0,0,0)`、`IBS::RelaySafe=(0,1,1)`；准备/收尾总超时均 5000 ms | 继电器与固定阶段；不改变固定模板 |
| 参数组 `IBS_Case` | `IBS::TB_MaxSwitchVoltage_V=1.0` | 带电切换互锁；用例不调用继电器安全切换函数 |
| 参数组 `休眠平均电流测试` | `SC_StartVoltage_V=10`、`SC_EndVoltage_V=14`、`SC_VoltageStep_V=1`；`SC_ChargeLimit_A=0.5`、`SC_DischargeLimit_A=0.5`、`SC_VoltageTimeout_ms=5000`、`SC_VoltageTolerance_V=0.5`、`SC_IntegrationWindow_ms=1200000`、`SC_AvgLimit_mA=0.250` | **仅属休眠用例**；不得改其默认值冒充工作电流的 1 A / 2 s / 10 min / 25 mA |
| Test Table Function | `PHASE_Prepare(string SequenceName)`、`PHASE_Complete()`、`StartLog(string TestCaseName)`、`StopLog()` | 只按已有 Preparation / Completion 模板单入口复用 |
| Test Sequence / Test Case | `SleepCurrentTest` / `SleepCurrent(float OutPutVoltage)`；另有 `FramePhaseCheck` | `SleepCurrent` 内含停 LIN、休眠静置及 <0.250 mA 判据，不适用于工作电流；**无现成工作电流 Test Case** |
| CAPL Function | `PWR_Configure_Check(float V, float Ichg, float Idchg)`、`PWR_On_Check()`、`PWR_Off_Check()`、`LIN_OpenNormal_Check()`、`LIN_Stop_Check()`、`PWR_WaitZero_Check()` | 签名取自当前 `IBSFunctions.can` 的 `export testfunction`；`RELAY_SafeSwitch_Check(int state)` 已有但按既定要求暂不接入 |
| 当前 CAPL 中引用的系统变量 | `N8361::DVM_Voltage`、`LIN::LINMsg_RxCounter`、`LIN::LINMsg_RxCounterClear` 等 | 到压实测与通讯检查； |
| 当前 VTT 已引用的积分变量 | `IBS_LIN::StaticCurrent_Window_ms`、`StaticCurrent_Clear`、`StaticCurrent_StartNs`、`StaticCurrent_Done`、`StaticCurrent_Time`、`StaticCurrent_Avg`、`StaticCurrent_Sum` | 已有窗口协议；新用例必须验证采样连续性及 600 s 有效覆盖后才判平均值 |
| 待接入的候选反馈 | 链接的 `Project_SysVar.vsysvar` 有 `LIN::ResetUBattV`；外部 `CURRENT_CAL.can` 对有效 `U_BATT` 按 `U_BATT/1024+3` 写入 | **当前 `IBSFunctions.can` 和 `IBSTest.vtt` 未引用该变量**；须确认当前 CANoe 测量加载该脚本、更新频率和读数新鲜度后，才能纳入用例清单 |
| 外部积分来源 | 链接的 `CAB1500_CurrentMeasure.can` 支持 `Window_ms`、`Clear`、`Done`、`Time`、`Avg`；`Avg` 单位 mA | 原用途是静态电流；确认 CAB1500 量程、绕线匝数、工作电流下不饱和，且采样脚本实际运行；断帧时可能低估均值 |

资源出处：`../../IBSTest/IBSTest.vparam`、`../../IBSTest/IBSFunctions.can`、`../../IBSTest/IBSTest.vtt`、`../../IBSProject.vtsoproj`，以及项目文件引用的外部 `Project_SysVar.vsysvar`、`CURRENT_CAL.can`、`CAB1500_CurrentMeasure.can`。现有 Prepare 模板依次执行 `StartLog → 记录开始 → PHASE_Prep_LinStop → PHASE_Prep_WakeNodeOff → PHASE_Prep_PowerOff → PHASE_Prep_RelayIdle → 记录完成`；Complete 模板依次执行 `PHASE_Done_Begin → PHASE_Done_LinStop → PHASE_Done_PowerOff → PHASE_Done_WaitZero → PHASE_Done_RelaySafe → PHASE_Done_WakeNodeOff → StopLog → PHASE_Done_Result`，两者均不调整。

## 03 页面步骤（已确认资源部分；非可直接实施的完整用例）

建议 Test Tree 位置：`工作电流测试 → 工作电流测试（10–14 V）`。每个电压点在 Test Sequence 中对应独立 Test Case；用例内部步骤必须在 Test Table 页面可见。下面**只列已确认资源可表达的步骤**，到反馈判定处停止，后续动作写在第 04 节的阻断清单，不能将其视作已确认实施方案。

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Preparation | 准备测试环境 | `PHASE_Prepare(SequenceName)`，保持原模板原字段与顺序 | 已有 Test Table Function |
| Test Case | 10 V 工作电流（11、12、13、14 V 同一结构，分别调用） | **拟建**工作电流 Test Case；当前没有同类可复用用例 | 拟建 Test Case，尚未创建 |
| CAPL Function | 配置目标电压与限流 | `PWR_Configure_Check(Vbat, Ichg, Idchg)`；原文限流 1 A，两个方向的取值待确认 | 已有 CAPL Function，参数未确认 |
| CAPL Function | 开启电源输出 | `PWR_On_Check()` | 已有 CAPL Function |
| Await Value Match | 2 秒内等待供电电压到位 | `N8361::DVM_Voltage`，目标 Vbat；**允许偏差待确认** | 原生节点，尚不能填完整判据 |
| CAPL Function | 启动 LIN 通讯 | `LIN_OpenNormal_Check()`；已有函数按 `TB_LinFrameTarget` 判断收帧 | 已有 CAPL Function；不能替代 IBS 电压反馈判据 |
| Await Value Match | 1 秒内等待 LIN 电压反馈接近目标 | `LIN::ResetUBattV` 相对 `OutPutVoltage`，容差 `WC_UbattTolerance_V`，超时 `WC_UbattTimeout_ms` | 原生节点；反馈值取最新有效帧 |
| Completion | 完成测试并恢复安全态 | `PHASE_Complete()`，保持原模板原字段与顺序 | 已有 Test Table Function |

## 04 已实施流程与判据来源

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Set | 写入积分窗口并清零积分状态 | `StaticCurrent_Window_ms`=`WC_IntegrationWindow_ms`；`Clear`/`Done`/`StartNs`=0 | 原生节点 |
| Wait | 清零释放后等待 20 ms | `20` | 原生节点 |
| Set | 触发积分窗口 | `StaticCurrent_Clear`=1 | 原生节点 |
| Await Value Match | 确认积分窗口已启动 | `StaticCurrent_StartNs` `>` 0，超时 2000 ms | 原生节点 |
| CAPL Inline | 计算积分超时与有效时长下限 | `IntegrationTimeoutMs` / `WindowSecondsMin` | 仅赋值 |
| Await Value Match | 等待积分完成（窗口时长 + 5 s） | `StaticCurrent_Done` `==` 1 | 原生节点，超时用变量 |
| State Check | 判据：积分已完成 | `StaticCurrent_Done` `==` 1 | 原生节点 |
| State Check | 判据：积分时长覆盖窗口 | `StaticCurrent_Time` `>=` `WindowSecondsMin` | 原生节点 |
| State Check | 判据：平均电流严格小于 25 mA | `StaticCurrent_Avg` `<` `WC_AvgLimit_mA` | 原生节点 |
| CAPL Function | 关闭电源输出 | `PWR_Off_Check()` | 调 `.can` 的 testfunction |

判据取值依据你的答复：充放电限流均设 1 A；到压与 LIN 电压反馈的允许偏差沿用已有 0.5 V 设计；LIN 反馈的 1 s 从首帧通讯建立后开始计时（`LIN_OpenNormal_Check` 已清计数并等够帧数，反馈值必然来自新帧）；积分继续使用 `IBS_LIN::StaticCurrent_*` 窗口协议。

积分时长的下限用 `WC_TimeTolerance_s`（默认 2 s）扣减，避免休眠用例中 `Time` 略小于窗口时长而误判失败的问题；断帧仍会因分母计时、电荷不计而低估平均值，执行时须结合 `CAB1500_500::CANMsg_RxCounter` 或 BLF 日志判断采样是否中断。

## 05 参数与 Mode 分列

| 参数 | 记录类型 | Normal | Test | 说明 |
|---|---|---|---|---|
| `WC_StartVoltage_V` / `WC_EndVoltage_V` / `WC_VoltageStep_V` | 单记录 | 10 / 14 / 1 | — | 仅文档记录，电压点由 5 个 Test Case 显式给出 |
| `WC_ChargeLimit_A` / `WC_DischargeLimit_A` | 单记录 | 1.0 / 1.0 | — | 原文 1 A 限流，按你的答复充放电都设 1 A |
| `WC_VoltageTimeout_ms` / `WC_UbattTimeout_ms` | 单记录 | 2000 / 1000 | — | 原文 2 s 到压、1 s 反馈，属固定要求，不随 Mode 变 |
| `WC_VoltageTolerance_V` / `WC_UbattTolerance_V` | 单记录 | 0.5 / 0.5 | — | 判据容差，不放 Mode 列，避免调试时放宽判据 |
| `WC_TimeTolerance_s` / `WC_AvgLimit_mA` | 单记录 | 2.0 / 25.0 | — | 同上，判据类参数固定 |
| `WC_IntegrationWindow_ms` | **多记录 `[Mode]`** | **600000** | **20000** | 唯一进入 Mode 分列的运行时长；Test 列用于台架快速走通流程 |

Mode 是工程级变体属性（`IBSProject.vvarprop` 中 `Normal=0`、`Test=1`，`Modifiable=true`），测试单元已在 `EmbeddedTUVariantProperties` 中绑定 `Mode`，起始值为 `Normal`。切换 Mode 后，`WC_IntegrationWindow_ms` 随变体取值，VTT 无需改动。

状态：**已按本文件实施并通过编译（0 错误 0 警告）。台架运行时行为、`awaitvaluematch` 超时是否记为失败步骤、断帧证据仍未验证。**
