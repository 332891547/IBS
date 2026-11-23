# 休眠平均电流测试：VTT 页面方案

> 实现状态：休眠电流序列已加入工程并通过 vTESTstudio 编译；外部 CANoe/CAB1500 积分脚本是否运行、驱动及台架行为尚未验证。15 轮全量运行约 5.5 小时，不属于编译验证。

## 01 测试需求说明

- **目的与依据：**确认 IBS 在 10、11、12、13、14 V 下的休眠平均电流；依据本次需求，未提供外部标准编号。
- **条件：**IBS、电源、LIN、电流采样链路接好；每个电压点测 3 轮，共 15 轮。供电后 5 s 内实测 `N8361::DVM_Voltage` 与目标 Vbat 差值 <0.5 V；LIN 通讯满 60 s，再监控 10 s 报文和 DVM 电压（差值 <0.5 V）；停 LIN，等待休眠约 60 s（TBD）。DVM 是供电实测值，不是 IBS 的 LIN 电压反馈。
- **判据：**每轮连续积分 20 min，平均电流 **<0.250 mA（250 µA）**；15 轮全部合格才通过。应保留原始电流记录及计算结果，当前工程的原始数据导出能力尚未核实。“工作 10 s / 休眠 50 s”及“持续工作 10 min”另设用例。

## 02 测试流程设计

**Test Tree：**`IBSTest → 工作电流测试 → 休眠平均电流测试`；现有 `FramePhaseCheck`、`canoe 用法测试` 保留。

| Test Table 位置 | 页面步骤 / 调用 | 当前状态 |
|---|---|---|
| Preparation | `PHASE_Prepare(SequenceName)`：开日志 → 校验基础参数 → 停 LIN → 禁唤醒 → 关输出 → 继电器 IDLE | 已有；单入口，顺序不改 |
| 测试执行 | `SleepCurrent_Run`：10–14 V 每点 3 轮，调用现有 CAPL 电源/LIN 函数，检查 5 s 到压、60 s 通讯及随后 10 s 监控 | 已编译；限流参数默认 0 A，须台架确认并设置后才能执行 |
| 测试执行 | `SleepCurrent_Run`：停 LIN → 静置 60 s（TBD）→ 启动 CANoe 积分窗口并检查帧间隔、20 min 和每轮平均电流 <0.250 mA | 测试节点已编译；依赖外部 CAB1500 采样脚本在线运行 |
| Completion | `PHASE_Complete()`：停 LIN → 关输出 → 等 DVM 回零 → 继电器 SAFE → 禁唤醒 → 停日志 | 已有；单入口，失败也执行 |

序列已编译但尚未进行 CANoe 台架测试；不恢复已删除的 `SNAP_Write`。

## 03 项目资源清单

| 类别 | 当前工程已核实的资源 | 位置 |
|---|---|---|
| 变量 | `N8361::DVM_Voltage`、`LIN::LINMsg_RxCounter`；电源/继电器命令变量由 CAPL 封装访问 | [IBSFunctions.can](../IBSTest/IBSFunctions.can)；系统变量来自 CANoe 配置 |
| 函数 | `SleepCurrent_Run`、公共 `*_Check` 节点；`PHASE_Prepare`、`PHASE_Complete`、`StartLog`、`StopLog` | [IBSFunctions.can](../IBSTest/IBSFunctions.can)、[IBSTest.vtt](../IBSTest/IBSTest.vtt)、[函数接口规范](函数接口规范.md) |
| 参数 | `IBS::SC_*`（休眠平均电流测试组）、`IBS::TB_*`、`IBS::RelayIdle`、`IBS::RelaySafe` | [IBSTest.vparam](../IBSTest/IBSTest.vparam) |
| TestCase / 序列 | `SleepCurrentTest` 位于“工作电流测试”；保留 `FramePhaseCheck`、`canoe 用法测试` | [IBSTest.vtt](../IBSTest/IBSTest.vtt) |

**旧工程参考（未直接复制 TestCase）：**[IBS_BaseTest.vtt](D:/WorkContent/tsmaster/IBS_TMP/02_TestEngineeringCode/03_IBSTest_CANoe/02_IBS_VTestStudioConfig/IBS_BaseTest/IBS_BaseTest.vtt) 有 `StaticCurrentAtVoltage(OutPutVoltage)`；[CAB1500_CurrentMeasure.can](D:/WorkContent/tsmaster/IBS_TMP/02_TestEngineeringCode/03_IBSTest_CANoe/01_LIN_TestConfig/01_Equipment/CAB1500/Script/CAB1500_CurrentMeasure.can) 实现采样、滤波和 `IBS_LIN::StaticCurrent_*` 积分。当前序列只沿用旧系统变量积分协议，没有复制旧 TestCase 的设压动作和 `0.05 < Avg < 2.0 mA`、`Sum > 50 mA·s` 判据；该外部脚本是否被 CANoe 加载尚未验证。

## 04 参数配置说明

| 当前 `IBSTest.vparam` 名称 | 类型 | 默认值 | 单位 / 作用 |
|---|---|---:|---|
| `IBS::TB_LinOpenTimeout_ms` | Integer | 2000 | ms；等首帧 |
| `IBS::TB_LinFrameTarget` | Integer | 5 | 帧；通讯建立门槛 |
| `IBS::TB_LinStopSettle_ms` / `TB_RelaySettle_ms` | Integer | 100 / 50 | ms；停 LIN / 切继电器等待 |
| `IBS::TB_DvmZeroTolerance_V` / `TB_DvmZeroTimeout_ms` | Float / Integer | 1.0 / 1000 | V / ms；收尾回零，**不是**到压判据 |
| `IBS::RelayIdle` / `IBS::RelaySafe` | 3 个 Integer | (0,1,0) / (0,1,1) | Battery/CAB1500/IBS 命令元组；BATTERY 自动接通禁用 |

| “休眠平均电流测试”参数组（当前 vparam） | 类型 | 默认值 | 单位 |
|---|---|---:|---|
| `SC_StartVoltage_V` / `SC_EndVoltage_V` / `SC_VoltageStep_V` / `SC_Repeats` | Integer | 10 / 14 / 1 / 3 | V / V / V / 次 |
| `SC_VoltageTimeout_ms` / `SC_VoltageTolerance_V` | Integer / Float | 5000 / 0.5 | ms / V（严格小于） |
| `SC_LinRun_ms` / `SC_LinMonitor_ms` / `SC_SleepWait_ms` | Integer | 60000 / 10000 / 60000（TBD） | ms |
| `SC_IntegrationWindow_ms` / `SC_AvgLimit_mA` | Integer / Float | 1200000 / 0.250 | ms / mA（严格小于） |
| `SC_ChargeLimit_A` / `SC_DischargeLimit_A` | Float | 0.0 / 0.0（禁运行；须台架确认后设正值） | A |

旧工程系统变量 `IBS_LIN::StaticCurrent_Window_ms` 默认 600000 ms，本序列每轮设为 1200000 ms；旧 `CAB1500_500::CurrentGain` 默认 20（匝数），须按实际接线核对。两者均不是当前 vparam 参数。

## 05 算法说明

旧采样脚本每帧读取 `CAB1500_IP.AnalogCurrent.phys`（A），按 `滤波值 = 0.7 × 上次值 + 0.3 × 本帧值` 滤波，再用 `I_mA = 滤波值 × 1000 / CurrentGain` 折算。窗口内按采样间隔 `dt`（s）累加 `StaticCurrent_Sum += I_mA × dt`（mA·s）；窗口结束后取 `StaticCurrent_Avg = StaticCurrent_Sum / StaticCurrent_Time`（mA）。只在窗口完成、时长覆盖 20 min 时以 `<0.250 mA` 判定，旧判据须调整。

旧脚本跳过 `dt ≥ 2 s` 的断帧区间，但分母仍计入这段时间，可能低估平均值。当前序列在积分时检测 CAB1500 接收计数：超过 1.5 s 未增长即判失败；仍须台架验证采样节拍、计数器可靠性和原始记录能力。BLF 日志不能直接视为已导出原始电流数据。

## 06 接口及环境说明

- **工具：**CANoe 12.0、vTESTstudio 4.0.64.0（本任务已核对的工具版本）；不要求获取或建立 IBS 软件版本目录。
- **LIN / CAPL：**`LIN_OpenNormal_Check` 建立通讯，`LIN_Stop_Check` 停调度；后续收帧观察用 `LIN::LINMsg_RxCounter`。VTT 公共阶段调用见上表及[函数接口规范](函数接口规范.md)。
- **设备：**N8361 的 `DVM_Voltage` 用于供电判定；当前序列读写旧工程定义的 CAB1500 积分系统变量；采样节点是否在 CANoe 测量配置中运行未验证。当前文件不能证明设备驱动版本、继电器触点回读或原始电流文件导出能力；具体 LIN 通道和设备状态须在实际 CANoe 台架验证。
