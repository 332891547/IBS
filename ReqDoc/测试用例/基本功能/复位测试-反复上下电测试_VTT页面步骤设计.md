# 复位测试-反复上下电测试：VTT 页面步骤设计

## 01 需求与范围

依据《原始需求文档》6.10。被测 IBS 在典型工作模式下，以 8.5 V±0.5 V 上电保持 3 s、0 V±1 V 断电保持 1 s，循环 1000 次；电源上升/下降时间 100–200 ms。上电后的前 100 ms 允许错误帧；随后在上电 3 s 阶段监测 IBS 功能正常。断电 1 s 内要求 LIN Frames 计数不增加、ErrorsResp 计数增加。失败报告轮次及上电/下电阶段；不使用 7 V 门限判据。充电和放电限流均设为 0.5 A。

Preparation 后首次上电，再调用现有 `LIN_OpenNormal_Check()` 启动 Normal 调度表；等待 100 ms 后开始功能监测。Normal 调度整个测试期间保持运行，由 Completion 固定收尾流程停止。

本文为页面步骤设计，已按本表写入 `IBSTest.vtt`，尚未 F6 编译，不代表已通过编译或完成台架验证。序列 Preparation 与 Completion 固定调用不变；Preparation 后才设置并启动测试电源。

## 02 资源清单（已核实）

| 类别 | 当前资源 | 设计边界 |
|---|---|---|
| 固定阶段 | `PHASE_Prepare(string SequenceName)`、`PHASE_Complete()` | 当前 VTT 现有入口；Preparation 停 LIN、关输出、继电器切 IDLE；Completion 停 LIN、关输出、等 DVM 回零、切 SAFE、禁用唤醒节点并停日志。测试在 Preparation 后显式配置和启动电源。 |
| 电源控制 | `PWR_Configure_Check(float V,float Ichg,float Idchg)`、`PWR_On_Check()`、`PWR_Off_Check()`、`PWR_WaitZero_Check()` | 当前 `IBSFunctions.can` 中已有导出 CAPL 函数；电压 8.5 V，充/放电限流各 0.5 A。为允许 8.5 V，已按用户授权把 `PWR_Configure` / `PWR_On` 的电压下限由 10.0 V 放宽到 8.0 V，`TB_BatteryMin_V` 默认值同步改为 8.0 V。电源上升/下降时间须在设备/台架输出配置中实现并记录，当前未发现可编程设置接口。 |
| LIN 控制 | `LIN_OpenNormal_Check()`、`LIN_Stop_Check()` | 当前工程已有导出 CAPL 函数。Normal 调度表索引 0 是本用例采用值。 |
| LIN 统计量 | `_Statistics::LIN1::Frames`、`_Statistics::LIN1::ErrorsResp` | 已在本工程 CANoe 配置 `LINTestProject.cfg` 中确认为真实统计量（`_Statistics::LIN1` 命名空间）；当前 VTT 无引用先例，首次使用于本用例断电判据。 |
| LIN 有效帧判据 | `LIN::ResetMeasuredCounter`、`LIN::ResetInvalidCounter`、`LIN::ResetUBattV` | 当前 VTT 与 `SleepCurrent_Monitor_Check()` 使用；`ResetMeasuredCounter` 为有效 `Measured_Data`（0x34）帧计数。定义在外部工程 `Project_SysVar.vsysvar` 的 `IBS_LIN::LIN` 命名空间，由 `CURRENT_CAL.can` 递增；与 `LIN::` 前缀的对应关系待在 CANoe 中确认。 |
| 电压监测 | `N8361::DVM_Voltage`、`N8361::Set_OutputSts` | 当前工程实际引用的系统变量；用 DVM 到压确认 8.5 V±0.5 V及断电电压，不设置 7 V判据。 |
| 已有 Test Case / Sequence | 当前 VTT 已有 SOC、工作电流、电压精度等 Test Case；本次新增 `ResetRepeatedPowerCycle` 序列与其 Test Case | 本用例为新增资源，已写入 `IBSTest.vtt`；不改动既有 Test Case 与函数。 |
| 参数 / Test Case 变量 | 复用 `IBS::SC_VoltageTimeout_ms`（5000 ms）与 `IBS::SC_VoltageTolerance_V`（0.5 V） | 电压、限流按需求固定为 8.5 V / 0.5 A；Test Case 内新增局部变量 `CycleIndex`、计数基线及 `Vtarget_V`。 |
| Preparation / Completion | 当前 VTT 的固定函数定义 | 按 `PHASE_Prepare("ResetRepeatedPowerCycle")` 与 `PHASE_Complete()` 调用；不改模板内部步骤。 |

## 03 页面步骤

Test Sequence 页面只放 Preparation、一个主 Test Case、Completion；测试操作节点全部集成在主 Test Case 内，避免分散到 Test Sequence 层。

| Command | Caption（页面显示的中文） | 调用对象 | 封装 |
|---|---|---|---|
| Preparation | 准备反复上下电测试环境 | `PHASE_Prepare("ResetRepeatedPowerCycle")` | 已有 Test Table Function；固定模板 |
| Test Case | 复位测试：反复上下电 | 以下所有页面子步骤 | 本用例新增主 Test Case；Test Sequence 只调用此 Test Case |
| └ CAPL Function | 设置 8.5 V 与双向 0.5 A 限流 | `PWR_Configure_Check(8.5, 0.5, 0.5)` | 已有 CAPL Function；Test Case 子步骤 |
| └ CAPL Function | 开启电源输出 | `PWR_On_Check()` | 已有 CAPL Function；Test Case 子步骤 |
| └ Await Value Match | 确认电源到达 8.5 V±0.5 V | `N8361::DVM_Voltage` 范围 `[8.0, 9.0] V` | 原生 Await Value Match；首轮到压确认 |
| └ CAPL Function | 启动 LIN Normal 调度表 | `LIN_OpenNormal_Check()` | 已有 CAPL Function；上电后调用一次，调度保持运行至 Completion |
| └ CAPL Inline | 初始化循环序号 | `CycleIndex = 1` | CAPL Inline；Test Case 局部变量，循环上限为 1000 |
| └ While | 执行 1000 次上下电循环 | 上电阶段 3 s、断电阶段 1 s | 原生 While；循环主体全部集中在此 Test Case，首轮电源已在循环前开启 |
| └ Wait | 忽略上电初始错误帧 | 100 ms | 原生 Wait；每次重新上电后执行，Normal 调度不断开 |
| └ CAPL Inline | 锁存上电阶段有效帧与无效计数基线 | `LIN::ResetMeasuredCounter`、`LIN::ResetInvalidCounter` | CAPL Inline；每轮稳定等待 100 ms 后记录 |
| └ Wait | 监测 IBS 正常功能 | 2900 ms | 原生 Wait；与前置 100 ms 合计上电阶段 3 s，Normal 调度保持运行 |
| └ CAPL Inline | 判定本轮上电功能并标注失败轮次 | 有效帧计数须增加、无效计数不得增加；失败消息含循环序号及“上电失败” | CAPL Inline；失败用 `testStepFail`，通过用 `write` 记录，避免每轮产生报告步骤 |
| └ CAPL Inline | 保存断电前 LIN 统计量基线 | `_Statistics::LIN1::Frames`、`_Statistics::LIN1::ErrorsResp` | CAPL Inline；记录本轮断电判定起点 |
| └ CAPL Function | 关闭电源输出 | `PWR_Off_Check()` | 已有 CAPL Function；LIN Normal 调度继续运行 |
| └ Wait | 断电观察 | 1000 ms | 原生 Wait；期间 LIN 调度不停止 |
| └ CAPL Inline | 判定本轮下电状态并标注失败轮次 | `Frames` 不增加、`ErrorsResp` 增加；失败消息含循环序号及“下电失败” | CAPL Inline；失败用 `testStepFail`，通过用 `write` 记录；同时检查 DVM 是否进入 0 V±1 V |
| └ CAPL Inline | 推进循环序号 | `CycleIndex = CycleIndex + 1` | CAPL Inline；本轮下电判定后递增，使下一次上电失败显示正确轮次 |
| └ If | 已完成 1000 轮则退出循环 | `CycleIndex > 1000` → Break | 原生 If + Break；避免第 1001 次上电 |
| └ CAPL Function | 开启下一轮电源输出 | `PWR_On_Check()` | 已有 CAPL Function；位于 Break 之后，仅未退出循环时执行，LIN 调度保持运行 |
| └ Await Value Match | 确认本轮重新上电到达 8.5 V±0.5 V | `N8361::DVM_Voltage` 8.5 V±0.5 V | 原生 Await Value Match；不使用 7 V门限 |
| Completion | 完成测试并恢复安全态 | `PHASE_Complete()` | 已有 Test Table Function；固定收尾内停止 LIN 调度 |

## 04 关键判据与记录

- 供电目标：8.5 V±0.5 V；充电限流和放电限流均为 0.5 A。
- 上电阶段：先上电并确认 8.5 V±0.5 V，再调用 `LIN_OpenNormal_Check()` 启动 Normal 调度。每次启动调度/重新上电后等待 100 ms 容错；随后监测至上电累计 3 s，要求有效 Measured_Data 计数增加且无效计数不增加。
- 断电阶段：电源输出关闭，LIN Normal 调度持续运行 1 s；要求 `_Statistics::LIN1::Frames` 不增加、`_Statistics::LIN1::ErrorsResp` 增加，并在断电观察结束时 DVM 为 0 V±1 V。
- 重复次数：1000 次。出现失败时立即报告对应 `CycleIndex` 和“上电失败”或“下电失败”；不使用 7 V门限判据。
- 调度表不在循环内停止或重新启动；由 `PHASE_Complete()` 固定收尾停止。
- 循环控制：`CycleIndex` 从 1 起，While 条件 `< 1001`，每轮下电判定后自增并对 `> 1000` 执行 Break，确保恰好 1000 轮且第 1000 轮断电后不再上电。

## 05 已实施

实现文件与结果（均为在当前工程内实际修改）：

| 文件 | 改动 |
|---|---|
| `IBSTest.vtt` | 在「电气测试」组新增序列 `ResetRepeatedPowerCycle`（navid `0f4b6a20-…`），新增同名 `ts_definition` 与 `tc_definition`；Sequence 只含 Preparation → 单一 Test Case → Completion。纯新增 313 行，未删除既有内容。 |
| `IBSFunctions.can` | 按用户授权把 `PWR_Configure` / `PWR_On` 的电压下限 10.0 V 改为 8.0 V，并把 `TB_BatteryMin_V` 的下限校验同步改为 8.0 V（5 行注释与判断同步更新）。 |
| `IBSTest.vparam` | `IBS::TB_BatteryMin_V` 默认值 10.0 → 8.0（仅此一项）。 |

校验结果：`.vtt` XML 可解析、标签配平、`tcid` 与 `navid` 无重复、大括号 99/99；`.can` 大括号 95/95、无替换字符；`.vparam` 8 个 Group 与 68 个参数名数量未变、无替换字符。三份文件均保留原编码（`.vtt` UTF-8 BOM、`.can`/`.vparam` GBK）与原换行风格。

**编译状态：未验证。** 本机没有命令行编译入口（AGENTS.md 亦规定只能在编辑器按 F6），本次未执行 Build All Test Units，因此没有 `Compilation succeeded` 原文可贴。

## 06 未验证项

- **已解除的阻断项：8.5 V 曾被现有电源函数拒绝。** `IBSFunctions.can` 原将 `PWR_Configure` / `PWR_On` 的电压下限硬编码为 10.0 V，会让 `PWR_Configure_Check(8.5, 0.5, 0.5)` 返回 -1。经用户授权，已把两处下限改为 8.0 V，并把 `IBS::TB_BatteryMin_V` 默认值改为 8.0 V。该放宽同时影响其他调用这两个函数的用例的允许电压范围，需回归确认。
- `ResetMeasuredCounter` / `ResetInvalidCounter` 定义在外部工程 `Project_SysVar.vsysvar`（`IBS_LIN::LIN` 命名空间），由 `CURRENT_CAL.can` 对有效 Measured_Data 帧递增；该文件与约定命名空间 `LIN::` 的实际对应关系需在 CANoe 配置中确认后才能作为上电判据。
- `_Statistics::LIN1::Frames` 与 `_Statistics::LIN1::ErrorsResp` 已在 `LINTestProject.cfg` 中确认为真实统计量（`_Statistics::LIN1` 命名空间），但当前工程 VTT 尚无引用先例；其计数语义（累计帧数/累计响应错误）需与断电判据口径核对。
- 电源上升/下降时间 100–200 ms 需在设备输出配置与实际 DVM 记录中验证，不使用软件命令下发时刻代替电压到达时间。
- `PWR_On_Check()` / `PWR_Off_Check()` 现有函数内部失败消息不含循环序号；判据失败可按轮次和上下电阶段报告，电源命令自身失败不带轮次。
- 未执行 F6 编译，未进行台架验证；`LIN_OpenNormal_Check()` 在调度保持运行期只调用一次，第 2–1000 轮上电不再重复清零帧计数，其行为需实机确认。
