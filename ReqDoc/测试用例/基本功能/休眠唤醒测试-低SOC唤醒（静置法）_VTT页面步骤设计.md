# 休眠唤醒测试-低SOC唤醒（静置法）：VTT 页面步骤设计

## 01 需求与范围

依据《原始需求文档》6.9及用户最新澄清，本用例不做 4 小时静置。页面步骤集中在一个用例主流程内，原生 Test Command 与 CAPL Inline 保持可见，暂不新增可复用 Test Case。Preparation 后先设置继电器、配置并开启线性电源，确认供电后才启动 LIN 调度读取第一次温度；按温度中值设压并充/放电限流均为 10 A，检查标定和 DID；重启 IBS 时沿用第一次采集的温度计算设压，后续若采集到更新温度再重算调整；保持 25 min 后检查 SOC=100、SOC_STATE=2。随后配置 `SOCWU_Ena=1`、`SOCWU_Treshold=80`，短暂启动调度发送后停止。无论 30 min 无唤醒观察还是降压后的最长 3.7 h 唤醒等待，均保持 LIN 调度停止；按 1 s 检查 Wakeups 计数，达到基线+1 后才恢复 LIN 并读取唤醒原因。OCV25 阈值电压由 CAPL Inline 根据 OCV 表插值计算，再减 0.2 V。

本文件只记录页面步骤设计，不修改 VTT、CAPL 或参数文件，不代表已编译或台架执行。Preparation / Completion 固定封装不变。主流程行以下、Completion 之前的表格步骤均作为该 Test Case 子步骤展示；后续确认有复用需求再抽成共用封装。

## 02 资源清单（已核实）

| 类别 | 当前资源 | 设计边界 |
|---|---|---|
| 固定阶段 | `PHASE_Prepare(string SequenceName)`、`PHASE_Complete()` | Preparation 会停 LIN、关输出、继电器切 IDLE；按固定模板使用，不改内部。Preparation 后明确写入继电器值，配置并开启电源后再启动 LIN 取温度 |
| 继电器 | `Power_RelayCrtl::BatteryConnectEquipment`、`IBS_PowerCtrl`、`CAB1500_PowerCtrl` | 页面 Set 值均为 0；项目确认的继电器语义为 `(0,0,0)` 是电池断开、IBS/CAB1500 电源继电器接通 |
| LIN / 电源封装 | `LIN_OpenNormal_Check()`、`LIN_Stop_Check()`、`PWR_Configure_Check(float V,float Ichg,float Idchg)`、`PWR_On_Check()`、`PWR_Off_Check()` | 先 `PWR_On_Check()` 建立供电，再调用 `LIN_OpenNormal_Check()`；供电前不启动 LIN 调度。`PWR_Configure_Check` 限流上限 11 A，允许输出开启时改设定电压 |
| 温度信号 | LDF `Measured_Data::T_BATT`、`Status_Temp`；已有 `SOC_FullChargeHold` 将二者锁存为 Test Case 变量 | `T_BATT` 物理值为 raw−40°C，raw=255 为 Invalid；既有满充逻辑以 `Status_Temp=0` 且 T 在图示温区内为有效条件。新用例页面变量采样后用于计算中值电压 |
| 满充保持 | 已有 Test Case `SOC_FullChargeHold(ChargeVoltage_V, ChargeCurrent_A, StartSOC_pct, DvmStartVoltage_V)`；已有 `SOC_FullChargeHold_ms` Normal=1500000 ms（25 min）/Test=60000 ms（1 min） | 该 Test Case 内部将放电限流固定为 0 A，不能满足本用例两个限流均 10 A，因此不调用；在本用例页面主流程中直接用电源 Function、LIN 原生节点及 25 min Wait 表达 |

| 满充结果 | 已有 `SOC_CheckFullChargeResult(TargetSOC)` | 使用一帧新鲜 LIN 报文同时检查 SOC 等于目标值、SOC_STATE=2，之后停止 LIN；调用目标值 100 |
| 重启与 SOC 状态 | 已有 `Restart_IBS(OffTime_ms)`、`CheckSOCStateCalibrated()`、`CheckSOCStateUncalibrated()` | 重启传入 60000 ms；已有未校准检查判定有效 SOC 且 SOC_STATE=0 或 1 |
| 诊断 | 当前 VTT 有 DID `0x1000`、`0x1001`、`0x1005` 读取/解析示例；`ReqDoc/config.ts` 有八个目标值 | 初始检查阶段逐字段比较：0x1000 Factor=1.0、Offset=0；0x1001 Initial=150、Quadratic=-0.000000453、Primary=0.0001034、Offset=0.997664843；0x1005 Factor=1.0、Offset=0 |
| SOCWU 信号 | LDF `IBS_Frame4` 含 `SOCWU_Ena`、`SOCWU_Treshold`；Normal 调度发送该帧。`Calc_Data_1` 含 `DisChargeCurrWU_Sts`、`ChargeCurrWU_Sts`、`SOCWU_Sts`、`DisChargeCurrWU`、`ChargeCurrWU`、`SOCWU` | 配置后仅短暂启动 Normal 调度发送；唤醒等待期间 LIN 调度必须停止；计数增加后再启动 LIN 读取六个原因信号 |
| 唤醒计数 | 用户确认 `_Statistics::LIN1::Wakeups` 可直接读取；用户要求 1 s 采样、计数增加 1 后核对六个信号 | 当前未见可复用的基线/目标计数 Test Case 变量；本用例需新增页面级变量保存基线、目标、当前值和耗时 |
| OCV25 | `ReqDoc/AGMH9_OCVTable.xlsx` `SourceFile`：SOC=0.8 对应 `OCV25=12.755 V` | 阈值由 CAPL Inline 查表插值并减 0.2 V；80% 时为 12.555 V |

## 03 页面步骤

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Preparation | 准备低 SOC 唤醒测试环境 | `PHASE_Prepare("LowSOCWake_Static")` | 已有 Test Table Function；固定模板，不改内部 |
| Test Case | 低 SOC 唤醒静置法主流程 | 以下页面步骤 | 本用例内的流程组织节点；原生 Test Command / CAPL Inline 均保持可见，暂不创建可复用封装 |
| Set | 设置整段测试继电器状态 | `BatteryConnectEquipment=0`；`IBS_PowerCtrl=0`；`CAB1500_PowerCtrl=0` | 原生 Set；按用户给定顺序逐项设值 |
| CAPL Function | 配置已确认的启动电压和 10 A 限流 | `PWR_Configure_Check(SOCWU_StartupVoltage_V, 10, 10)` | 已有 CAPL Function；启动电压须来自已确认的台架供电设定，不假设固定值 |
| CAPL Function | 先开启线性电源输出 | `PWR_On_Check()` | 已有 CAPL Function；供电确认之前不启动 LIN |
| Await Value Match | 确认启动电压到位 | `N8361::DVM_Voltage` 匹配 `SOCWU_StartupVoltage_V` | 原生 Await Value Match；复用现有电压容差/超时参数 |
| CAPL Function | 供电后启动 LIN Normal 调度并等待新帧 | `LIN_OpenNormal_Check()` | 已有 CAPL Function；严格在电源输出确认之后 |
| Set | 锁存初始 IBS 温度 | `SOCWU_T_BATT_C ← Measured_Data::T_BATT`；`SOCWU_TempStatus ← Measured_Data::Status_Temp` | 原生 Set；目标为本用例新增页面变量，源信号来自 LDF |
| State Check | 确认初始温度可用于查图 | `SOCWU_TempStatus=0` 且 `10 ≤ SOCWU_T_BATT_C ≤ 60` | 原生 State Check；raw=255/状态无效或温度超范围即失败 |
| CAPL Inline | 按温度区间计算电压中值 | `SOCWU_Vcal_V` 按第 04 节分段公式计算 | 当前用例短 Inline；仅使用页面变量与 CAPL 运算 |
| CAPL Function | 设置温度对应电压及 10 A 充/放电限流 | `PWR_Configure_Check(SOCWU_Vcal_V, 10, 10)` | 已有 CAPL Function；页面显式使用本次要求的两个 10 A 限流值 |
| Await Value Match | 等待 DVM 到达温度对应设定电压 | `N8361::DVM_Voltage` 匹配 `SOCWU_Vcal_V` | 原生 Await Value Match；复用 `SC_VoltageTimeout_ms`、`SC_VoltageTolerance_V` |
| Test Case | 检查初始标定状态 | `CheckSOCStateCalibrated()` | 已有 Test Case；检查有效 SOC 且 SOC_STATE=2 |
| LIN Change Schedule Table | 选择诊断响应调度表 | LIN 网络，`table_index=2` | 原生节点；沿用现有“切换调度表”用例配置 |
| Wait | 等待诊断调度稳定 | `1000 ms` | 原生 Wait |
| LIN Start Scheduler | 启动诊断调度 | LIN 网络 | 原生节点 |
| CAPL Inline | 读取并比较电压标定字段 | SID `0x22` / DID `0x1000`：Factor=1.0、Offset=0 | 页面可见 Inline；复用已有请求/解析示例并逐字段比较 |
| CAPL Inline | 读取并比较电阻标定字段 | SID `0x22` / DID `0x1001`：Initial=150、Quadratic=-0.000000453、Primary=0.0001034、Offset=0.997664843 | 页面可见 Inline；复用已有请求/解析示例并逐字段比较 |
| CAPL Inline | 读取并比较电流标定字段 | SID `0x22` / DID `0x1005`：Factor=1.0、Offset=0 | 页面可见 Inline；复用已有请求/解析示例并逐字段比较 |
| CAPL Function | 停止 LIN 调度 | `LIN_Stop_Check()` | 已有 CAPL Function |
| Test Table Function | IBS 断电 60 秒后重启 | `Restart_IBS(60000)` | 已有 Test Table Function |
| Test Case | 检查重启后 SOC_STATE 不为 2 | `CheckSOCStateUncalibrated()` | 已有 Test Case；SOC 有效且 SOC_STATE 为 0 或 1 |
| CAPL Function | 按第一次测得温度恢复中值电压 | `PWR_Configure_Check(SOCWU_Vcal_V, 10, 10)` | 已有 CAPL Function；重启后复用首次温度值，不重复启动 LIN 取温 |
| Await Value Match | 等待温度中值电压到位 | `N8361::DVM_Voltage` 匹配 `SOCWU_Vcal_V` | 原生 Await Value Match；输出保持开启 |
| CAPL Function | 停止 LIN 调度 | `LIN_Stop_Check()` | 已有 CAPL Function；停止重启状态检查所需的临时调度，25 min 保持前再显式启动 LIN |
| CAPL Function | 启动 Normal LIN 调度 | `LIN_OpenNormal_Check()` | 已有 CAPL Function；等待新帧 |
| Wait | 保持温度对应电压及 10 A 限流 25 min | `SOC_FullChargeHold_ms` | 原生 Wait；使用 Normal 模式 1500000 ms，电源输出与 LIN 保持开启；Test 模式 60000 ms 不作为完整测试时长 |
| Set | 锁存保持后的温度与状态 | `SOCWU_T_BATT_C ← Measured_Data::T_BATT`；`SOCWU_TempStatus ← Measured_Data::Status_Temp` | 原生 Set；沿用现有运行 LIN 调度收到的新帧 |
| State Check | 确认保持后温度有效且实测值在允许范围 | `SOCWU_TempStatus=0`、温度及 `N8361::DVM_Voltage` 落在第 04 节范围 | 原生 State Check；仅判定采样时刻，不表示连续监测 |
| CAPL Inline | 按更新温度重算中值电压 | 更新 `SOCWU_Vcal_V` | 当前用例 CAPL Inline；若与首测值不同则采用新值 |
| CAPL Function | 温度变化时调整输出电压 | `PWR_Configure_Check(SOCWU_Vcal_V, 10, 10)` | 已有 CAPL Function；输出保持开启 |
| Await Value Match | 等待最新温度对应电压 | `N8361::DVM_Voltage` 匹配 `SOCWU_Vcal_V` | 原生 Await Value Match |
| CAPL Function | 停止 LIN 调度 | `LIN_Stop_Check()` | 已有 CAPL Function；电源输出保持开启 |
| Test Case | 检查满充结果 SOC=100、SOC_STATE=2 | `SOC_CheckFullChargeResult(100)` | 已有 Test Case；新鲜 LIN 报文上同时检查两项并记录结果 |
| Set | 配置低 SOC 唤醒使能与阈值 | `SOCWU_Ena=1`；`SOCWU_Threshold_pct=80`；`SOCWU_Treshold ← SOCWU_Threshold_pct` | 原生 Set；LDF 信号定义于 `IBS_Frame4`，阈值输入供后续 Inline 复用 |
| CAPL Function | 启动 Normal 调度发送 SOCWU 配置 | `LIN_OpenNormal_Check()` | 已有 CAPL Function |
| Wait | 确认配置帧已发送 | `1000 ms` | 原生 Wait；`IBS_Frame4` 周期 200 ms |
| CAPL Function | 停止 LIN 并记录唤醒计数基线 | `LIN_Stop_Check()`；`WakeupsBaseline ← _Statistics::LIN1::Wakeups`；`WakeupsTarget ← WakeupsBaseline+1` | 已有 CAPL Function + 本用例新增页面变量；电源输出保持开启 |
| While | 30 min 内不得出现唤醒 | 每 1000 ms 比较当前 Wakeups 与基线，窗口 1800000 ms；变化即失败 | 原生 While + Wait + State Check；保留 30 min 窗口且全程不启动 LIN 调度 |
| CAPL Inline | 按阈值计算 OCV25 与目标电压 | 线性插值相邻 OCV25 表值后减 0.2 V，保存至 `SOCWU_TargetVoltage_V` | 当前用例 CAPL Inline；使用第 04 节数据分段线性插值 |
| CAPL Function | 输出电压调整到阈值对应目标 | `PWR_Configure_Check(SOCWU_TargetVoltage_V, 10, 10)` | 已有 CAPL Function；输出保持开启，充/放电限流均 10 A |
| Await Value Match | 等待 DVM 到达动态阈值目标电压 | `N8361::DVM_Voltage` 匹配 `SOCWU_TargetVoltage_V` | 原生 Await Value Match；LIN 调度保持停止 |
| While | 每秒监测唤醒，最长 3.7 h | `_Statistics::LIN1::Wakeups` 每 1000 ms 采样；目标 `WakeupsBaseline+1`；超时 13320000 ms | 原生 While + Wait + State Check；全程不启动 LIN 调度，达到目标退出，超时失败 |
| CAPL Function | 恢复正常 LIN 通讯 | `LIN_OpenNormal_Check()` | 已有 CAPL Function；启动 Normal 调度并等待新帧 |
| State Check | 检查低 SOC 唤醒原因 | `DisChargeCurrWU_Sts=0`、`ChargeCurrWU_Sts=0`、`SOCWU_Sts=1`、`DisChargeCurrWU=0`、`ChargeCurrWU=0`、`SOCWU=1` | 原生 State Check；六个信号来自 LDF `Calc_Data_1` |
| Completion | 执行固定收尾 | `PHASE_Complete()` | 已有 Test Table Function；固定模板，不改内部 |

## 04 计算与判定

**温度对应电压中值**

| 温度 | 图示允许下限 | 图示允许上限 | 取值中点 |
|---:|---:|---:|---:|
| 10°C | 15.0 V | 15.5 V | 15.25 V |
| 25°C | 13.5 V | 15.5 V | 14.5 V |
| 40°C | 13.5 V | 15.5 V | 14.5 V |
| 60°C | 13.5 V | 14.5 V | 14.0 V |

图示端点间分别线性插值上下限后取中值，等价分段公式：

- 10°C ≤ T ≤ 25°C：`Vcal = 15.25 − 0.05 × (T−10)`。
- 25°C < T ≤ 40°C：`Vcal = 14.5`。
- 40°C < T ≤ 60°C：`Vcal = 14.5 − 0.025 × (T−40)`。

10–60°C 以外不外推；`Status_Temp` 无效或 T_BATT 超范围时失败，不继续设压。由于 25 min 阶段不调用 `SOC_FullChargeHold`，本表仅在保持结束时用原生 State Check 核对温度/实测电压区间，不声称保持期间连续监控。

**阈值对应 OCV25 目标电压**

CAPL Inline 根据 `SOCWU_Threshold_pct` 找到相邻 SOC 数据点，按 `OCV25_low + (threshold-SOC_low)*(OCV25_high-OCV25_low)/(SOC_high-SOC_low)` 计算插值电压，再减 0.2 V 写入 `SOCWU_TargetVoltage_V`。修改 SOC 阈值只需调整阈值输入，不再手改固定 12.555 V。表值来自 `AGMH9_OCVTable.xlsx` 的 `SourceFile`：

| SOC | OCV25 |
|---:|---:|
| 100% | 13.036 V |
| 90% | 12.892 V |
| 80% | 12.755 V |
| 70% | 12.618 V |
| 60% | 12.476 V |
| 50% | 12.329 V |
| 40% | 12.185 V |
| 30% | 12.031 V |
| 20% | 11.869 V |
| 10% | 11.691 V |
| 0% | 11.460 V |

**低 SOC 唤醒判据**

- 初始三个 DID 共 8 个标定字段逐项与工程配置目标比较。
- 重启后检查 SOC 有效且 SOC_STATE 为 0 或 1。
- 满充保持结束后 `SOC_CheckFullChargeResult(100)` 同帧判定 SOC=100、SOC_STATE=2。
- `SOCWU_Ena=1`，`SOCWU_Treshold=80`。
- OCV25 表中 SOC=80% 时为 12.755 V，阈值 80% 对应目标为 12.555 V；其他阈值由 CAPL Inline 按相邻表项线性插值后减 0.2 V。
- 以无唤醒观察窗口开始时的 `_Statistics::LIN1::Wakeups` 为基线；30 min 内必须不变。降至动态目标电压后每 1 s 检查，首次达到基线+1 即检测到唤醒；最多等待 3.7 h。
- 30 min 无唤醒观察和最长 3.7 h 唤醒等待期间均不得启动 LIN 调度；只在 Wakeups 计数增加后恢复 Normal LIN，再检查六个状态/数据字段确认 SOC 唤醒原因。

## 05 本用例页面变量

以下是本用例拟新增的页面级变量，不是现有 CAPL API 或 `.vparam` 参数；本轮只作设计记录：

| 页面变量 | 用途 |
|---|---|
| `SOCWU_T_BATT_C` | 锁存 `Measured_Data::T_BATT` 的物理温度 |
| `SOCWU_TempStatus` | 锁存 `Measured_Data::Status_Temp` 并确认有效 |
| `SOCWU_Vcal_V` | 保存温度区间中值电压 |
| `SOCWU_StartupVoltage_V` | 供电后首次取温前的启动电压，须由台架既有设定确认，本文不指定数值 |
| `SOCWU_Threshold_pct` | 页面侧阈值输入，初始 80；同值写入 LDF 信号 `SOCWU_Treshold` 并供 CAPL Inline 计算使用 |
| `SOCWU_TargetVoltage_V` | CAPL Inline 按 OCV25 表和阈值动态计算出的目标电压 |
| `WakeupsBaseline` / `WakeupsTarget` | 保存初始 Wakeups 计数及基线+1 目标 |
| `WakeupsCurrent` | 保存每秒采样值 |
| `WakeElapsed_ms` | 累计 While 等待时间，分别用于 30 min 与 3.7 h 窗口 |

固定时间与限值直接写在页面步骤中；目标电压由 CAPL Inline 按阈值表插值计算，不增加 `.vparam` 判据参数。已有 `SOC_PointRest_ms` 不在本方案使用。

## 06 未验证边界

- 本文是页面步骤设计，不是 `.vtt` 实现或编译结果，也没有台架运行证据。
- 首次取温必须在电源输出有效后才启动 `LIN_OpenNormal_Check()`；但供电后首次取温前应使用的启动电压没有可确认的统一工程值，当前页面变量 `SOCWU_StartupVoltage_V` 需按台架既有设定补定。未确认该设定前，不应据此实施或声称步骤可直接执行。
  答：首次启动使用 电压12V 
- 首次温度用于 IBS 重启后的设压；25 min 保持后若重新采集温度，则按新值重算和调整。温度在 25 min 内的连续变化不由页面 Wait 自动监控。
- 25 min 阶段使用 `PWR_Configure_Check(SOCWU_Vcal_V,10,10)`，充/放电限流均为 10 A。现有 `SOC_FullChargeHold` 将放电限流固定为 0 A，因此本方案不调用该 Test Case。
  答：可以设置PWR_Configure_Check()为可调用得
- OCV25 插值在 CAPL Inline 中的页面变量可见性/赋值方式、`_Statistics::LIN1::Wakeups` 的 1 s 采样行为、动态目标电压跟随效果及唤醒后六个信号值均未编译或台架验证。
