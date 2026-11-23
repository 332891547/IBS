# IBS 参数文件规范

版本 v0.1 ｜ 2026-11-21 ｜ 配套：[IBS 测试工程规范](IBS测试工程规范.md)

## 1. 文件与分组

- 参数文件沿用 vparam 机制（现为 `BatteryChargeDischarge.vparam`，新工程可另起文件名，格式不变）。
- 工程级参数统一放组 `IBS::TestBase`，下设 4 个子组：`Relay`、`Power`、`Lin`、`Log`。
- 用例级参数放各自功能组（如 `IBS::QuiescentCurrent`），**不得**塞进 `TestBase`。
- 一个参数只能出现在一个组里；同名不同义视为错误。

## 2. 三类参数

| 类别 | 位置 | 谁读 | 用例能否覆盖 |
|---|---|---|---|
| G 工程级 | `IBS::TestBase` | 封装函数内部、prep / completion | 否，全局只读 |
| F 函数级 | 封装函数入参 | 封装函数 | 能，传 `-1` 表示取 G 默认 |
| C 用例级 | 用例功能组 | 用例体 | 能，随用例走 |

约定：

- 用例只传**语义参数**（状态、目标电压、目标窗口），不传调参值和安全阈值。
- 安全与硬件边界只做 G，不开放 F，防止用例把保护关掉。
- 函数内部读 G，调用方无需重复传值。

## 3. 命名规则

| 规则 | 示例 |
|---|---|
| 工程级前缀 `TB_` | `TB_DvmZeroTimeout_ms` |
| 对象 + 属性 + 单位 | `TB_RelaySettle_ms` |
| 继电器状态表 | `TB_Relay_SAFE_Battery`、`TB_Relay_IDLE_CAB1500` |
| 布尔用 `_Enable` / `_Required`，值 0/1 | `TB_RequireOutputOffForBattery` |
| 单位后缀固定：`_ms` / `_s` / `_V` / `_mA` / `_A` / `_pct` | `TB_BatteryMax_V` |
| 名称不缩写、不歧义 | 写 `CAB1500`，不写 `Cab` |

## 4. 类型与单位

- 类型只用 `Integer` / `Float` / `String`；0/1 布尔用 `Integer`。
- 时间统一 **ms**，电压 **V**，电流 **A**（mA 必须带 `_mA` 后缀）。
- 每个参数的 `Info` 列写清：中文用途 + 单位 + 允许范围。
- 不允许空 Info、不允许只写“参数”。

## 5. 工程级参数清单（G）

### 5.1 Relay

| 参数 | 类型 | 默认 | 范围 | 用途 |
|---|---|---:|---|---|
| TB_Relay_SAFE_Battery / CAB1500 / IBS | int ×3 | 0 / 1 / 1 | 0~1 | 收尾安全态命令元组 |
| TB_Relay_IDLE_Battery / CAB1500 / IBS | int ×3 | 0 / 1 / 0 | 0~1 | 准备态命令元组 |
| TB_Relay_BATTERY_Battery / CAB1500 / IBS | int ×3 | 1 / 1 / 0 | 0~1 | 用例体接电池命令元组 |
| TB_RelaySettle_ms | int | 50 | 0~500 | 切继电器后等待稳定 |
| TB_RelayReadbackTimeout_ms | int | 500 | 100~2000 | 回读核对超时 |
| TB_RelayReadbackSamples | int | 3 | 1~10 | 回读连续一致次数（默认值） |

### 5.2 Power

| 参数 | 类型 | 默认 | 范围 | 用途 |
|---|---|---:|---|---|
| TB_DvmZeroTolerance_V | float | 1.0 | 0.1~2.0 | completion 回零判据 |
| TB_DvmZeroTimeout_ms | int | 1000 | 200~5000 | 回零有界等待 |
| TB_DvmPoll_ms | int | 10 | 5~50 | 电压轮询间隔（默认值） |
| TB_DvmStableSamples | int | 3 | 1~10 | 连续达标次数（默认值） |
| TB_MaxSwitchVoltage_V | float | 1.0 | 0~5 | 高于此值禁止切继电器 |
| TB_RequireOutputOffForBattery | int | 1 | 0~1 | 接电池前必须确认输出已关 |
| TB_BatteryMin_V / TB_BatteryMax_V | float ×2 | 10.0 / 15.5 | Min < Max | 接电池允许窗口（测试侧校验） |

### 5.3 Lin

| 参数 | 类型 | 默认 | 范围 | 用途 |
|---|---|---:|---|---|
| TB_LinStopSettle_ms | int | 100 | 0~1000 | 停调度后等待再关电源 |
| TB_LinOpenTimeout_ms | int | 2000 | 500~5000 | 开调度后等首帧超时 |
| TB_LinFrameTarget | int | 5 | 1~20 | 通讯建立的帧数门槛 |

### 5.4 Log

| 参数 | 类型 | 默认 | 范围 | 用途 |
|---|---|---:|---|---|
| TB_PrepTotalTimeout_ms | int | 5000 | 1000~15000 | 准备段总超时 |
| TB_CompletionTotalTimeout_ms | int | 5000 | 1000~15000 | 收尾段总超时 |
| TB_LogStopTimeout_ms | int | 500 | 100~2000 | 停日志超时 |
| TB_LogPrefix | string | `IBS_` | — | 日志前缀 |
| TB_ParamSetVersion | int | 1 | — | 参数集版本，写入报告 |
| TB_StationId | string | 空 | — | 台架标识，写入报告 |

## 6. 函数级参数（F）与签名

| 函数 | 签名 | 内部读取的 G | 说明 |
|---|---|---|---|
| `RELAY_Set` | `RELAY_Set(state, readbackSamples = -1)` | `TB_RelaySettle_ms`、`TB_RelayReadbackTimeout_ms`、`TB_RelayReadbackSamples`；`BATTERY` 态另校验 `TB_BatteryMin_V`、`TB_BatteryMax_V`、`TB_MaxSwitchVoltage_V`、`TB_RequireOutputOffForBattery` | `-1` 取 G 默认；安全校验不开放入参 |
| `PWR_WaitZero` | `PWR_WaitZero(tol = -1, timeout = -1, poll = -1, samples = -1)` | `TB_DvmZeroTolerance_V`、`TB_DvmZeroTimeout_ms`、`TB_DvmPoll_ms`、`TB_DvmStableSamples` | `-1` 取 G 默认 |
| `PWR_Configure` | `PWR_Configure(V, Ichg, Idchg)` | `TB_BatteryMin_V`、`TB_BatteryMax_V`（电池已接入时） | 安全校验在函数内，**不开入参** |
| `LIN_Stop` | `LIN_Stop()` | `TB_LinStopSettle_ms` | — |
| `LIN_OpenNormal` | `LIN_OpenNormal()` | `TB_LinOpenTimeout_ms`、`TB_LinFrameTarget` | — |

结论（对应本次讨论）：

| 参数 | 类别 | 用例是否需要留位置 |
|---|---|---|
| TB_RelayReadbackSamples | G 默认 + F 入参 | 不需要，函数有槽位，默认 `-1` |
| TB_DvmPoll_ms | G 默认 + F 入参 | 不需要，同上 |
| TB_DvmStableSamples | G 默认 + F 入参 | 不需要，同上 |
| TB_MaxSwitchVoltage_V | 仅 G | **不需要，且不应开放**；安全阈值 |
| TB_RequireOutputOffForBattery | 仅 G | **不需要，且不应开放**；安全互锁 |
| TB_BatteryMin_V / TB_BatteryMax_V | 仅 G | **不需要**；硬件边界，由函数校验 |

> CANoe 侧 `N8361_Proc` 仍保留 10~15.5 V 兜底；vparam 的边界是测试侧第一道校验，两道都要在。

## 7. 用例级参数（C）

示例（各用例组自管，不进 `TestBase`）：

| 参数 | 组 | 用途 |
|---|---|---|
| QC_SleepWindow_ms | IBS::QuiescentCurrent | 单窗时长 |
| QC_MinWindow_s | 同上 | 窗口有效性门槛 |
| QC_MinWakeCount | 同上 | 每段唤醒次数门槛 |
| 电压点 / 降压步数 / SOC 目标 | 各功能组 | 用例条件 |

判据类参数（0.250 mA、窗口 10 s、5 次唤醒）只能出现在用例组，不得进 `TestBase`。

## 8. 校验规则

在 `PHASE_Prepare` 内、`StartLog` 之后、首次设备动作之前统一校验（`PHASE_ValidateParams`），失败即“准备失败”，不得带病开跑：

1. 所有超时 > 0，且不超过上限。
2. 继电器三个元组每项 ∈ {0,1}，SAFE ≠ IDLE。
3. `BatteryMin_V < BatteryMax_V`，且在设备允许范围内。
4. `0 < DvmZeroTolerance_V ≤ 5`，`1 ≤ DvmStableSamples ≤ 20`，`1 ≤ DvmPoll_ms ≤ 100`。
5. `LinFrameTarget ≥ 1`。
6. 校验失败日志格式：`[MOD=PARAM][INVALID] name=... value=...`。

## 9. 版本与追溯

- 任何参数改动，`TB_ParamSetVersion` +1。
- 变更记录表（放本文件末尾）：

| 版本 | 日期 | 参数 | 旧值 → 新值 | 原因 | 影响用例 |
|---|---|---|---|---|---|
| 1 | 2026-11-21 | 初版 | — | — | — |

- 报告头写入 `TB_ParamSetVersion`、`TB_StationId`。

## 10. 变更流程

- **新增**：定类别（G/F/C）→ 定默认与范围 → 加校验 → 更新本文件 → 版本 +1。
- **废弃**：标记 deprecated，保留一个版本，不直接删；调用方改完再删。
- **重命名**：旧名保留一版别名，新名启用后下一版删除旧名。
- **禁止**：同义参数并存、用例里写死数值、绕过 G 直接写 sysvar。

## 11. 结构体降级方案

若 vparam 不支持结构体：

- 方案 A：扁平 9 个 `TB_Relay_<STATE>_<CHANNEL>`（推荐，可读性最好）。
- 方案 B：3 个 3 位掩码（`bit0=Battery, bit1=CAB1500, bit2=IBS`）。
- 无论哪种，代码只通过 `RELAY_Tuple(state, idx)` 访问，用例不直接引用参数名。

## 12. 落地顺序

1. 在 vparam 建 `IBS::TestBase` 及 4 个子组，填默认值。
2. 实现 `RELAY_Set` / `PWR_Configure` / `PWR_On` / `PWR_Off` / `PWR_WaitZero` / `LIN_Stop` / `LIN_OpenNormal` / `SNAP_WakeNode` 八个封装函数。
3. 让 `PHASE_Prepare` / `PHASE_Complete` 只调用封装函数。
4. 加 prep 参数校验：`PHASE_ValidateParams`，固定在 `StartLog` 之后。
5. 用一条休眠用例 + 一条复位用例回归，确认参数生效且不改代码。