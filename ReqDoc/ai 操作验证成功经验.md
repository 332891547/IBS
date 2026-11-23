# AI 操作验证成功经验

本文记录在 `IBSTest` 工程中编写 VTT 测试用例时，已通过实际编译/界面确认的事实与踩过的坑。
后续操作前先读本文，可避免重复试错。

适用环境：vTESTstudio 4.0.64.0、CANoe 12.0，工程 `C:\Users\HF_company\Desktop\IBS`。

---

## 一、编码格式（最高优先级，一次搞错全文件乱码）

### 实测结论

| 文件 | 编码 | BOM | 首行声明 |
|---|---|---|---|
| `IBSTest.vtt` | UTF-8 | **有 BOM** | `<?xml version="1.0" encoding="utf-8"?>` |
| `IBSTest.vparam` | **GBK(936)** | 无 | 无 |
| `IBSFunctions.can` | **GBK(936)** | 无 | `/*@!Encoding:936*/` |
| `IBSProject.vvarprop` | UTF-8 | 有 BOM | — |
| `IBSProject.vtsoproj` | UTF-8 | 有 BOM | — |

### 必须遵守

1. **`.vparam` 和 `.can` 是 GBK**。用 `Get-Content -Encoding Default` 读、用 `[System.Text.Encoding]::GetEncoding(936)` 写。
   PowerShell 7 的 `Set-Content -Encoding UTF8` 会写成 UTF-8，**直接损坏中文注释**。
2. **`.vtt` 是 UTF-8 带 BOM**。用 `-Encoding UTF8` 读写；重写时保留 BOM。
3. **绝不能用 UTF-8 工具生成中文内容再按 GBK 写入**。曾因此让整个 `.can` 文件出现 952 个替换字符，需从备份恢复。
   正确做法：先用对应编码读出原文件字符串 → 在内存里替换 → 再用同一编码写回。
4. 每次写回后必须校验：`($text.ToCharArray() | Where-Object { $_ -eq [char]0xFFFD }).Count` 应为 **0**。

### 待办风险

`IBSTest.vtt` 当前是 **CRLF 283 / lone LF 338 混合行尾**，是多次编辑造成。vTESTstudio 能正常读取并编译，
但若后续出现解析异常，先统一行尾为 CRLF。

---

## 二、编译与验证

### 编译入口

- **没有命令行编译**。已确认安装目录 `D:\Program Files\Vector vTESTstudio 4.0\Exec64\` 下无 `TestUnitBuildCLI.exe`，
  官方资料给出的方式是编辑器 **Home → Build All Test Units（F6）**。
- 构建日志：`obj_IBSProject\d2c5homfeg7q.lastbuild`（UTF-8）。
- 产物：`IBSTest\IBSTest.vtuexe`。

### 判定编译成功的原文关键字

```
# Compilation succeeded (HH:MM:SS) -- 0 errors, 0 warnings
# Test unit created '...\IBSTest.vtuexe'
```

**注意**：若上次构建后未改文件，日志会显示 `is up to date` 而没有 `Compilation` 行。
这是增量构建，**不代表编译失败**。要强制全量验证，先改一个字节再构建，或删 `obj_IBSProject` 后重建。

### F6 为什么经常"没反应"

实测三种失败原因，均非代码问题：

| 现象 | 原因 | 解决 |
|---|---|---|
| 日志时间戳不变 | 编辑器不是前台窗口（DSH/浏览器抢焦点） | `$w.AppActivate($pid)` 后 `SendKeys('{F6}')`；必要时最小化其他窗口 |
| 按键无效果 | 弹了"文件已被另一程序修改，是否重新加载"对话框 | 先发 `y` 确认，再发 `{F6}` |
| 点击按钮无效 | 光标位置/Cursor 类型未加载 | 先 `Add-Type -AssemblyName System.Windows.Forms,System.Drawing` |

**最可靠顺序**：改完文件 → 激活编辑器 → 发 `y`（确认重载）→ 等待 3~5 s → 发 `{F6}` → 等待 25~30 s → 读日志。

---

## 三、已验证的 VTT 语法（可直接复用）

### 3.1 CAPL Inline 是独立编译单元

**Inline 里不能调用 `.can` 中的函数，也不能访问 `.can` 的全局变量。**
实测报错：

```
1156 at (1,5): unknown function "LIN_Stop".
1156 at (1,5): unknown function "PWR_Off".
1053 at (1,1): Unknown symbol 'gIBSCleanupFailed'.
```

Inline 只能用：`@sysvar::` 系统变量、`syspar::` 参数、CAPL 内建函数、以及**本作用域**声明的变量。

需要调用 `.can` 函数时，用 `<caplfunction>` 节点，不要写进 Inline。

### 3.2 三种调用节点的区别

| 节点 | 调用对象 |
|---|---|
| `<ttfunction>` | Test Table 内部定义的 Function（`function_definitions` 里） |
| `<caplfunction>` | `.can` 里 `export testfunction` 的函数 |
| `<caplinline>` | 内联 CAPL 代码 |

三者不能混用。把 CAPL 函数写进 `<ttfunction>` 会报 `Function 'xxx' not found`。

### 3.3 `<caplfunction>` 可以用在 Test Case 内（已验证）

旧工程没有在 Test Case 内用过 `<caplfunction>`，但**本工程实测通过**：
`SleepCurrent` Test Case 的循环体内直接调用 `PWR_Configure_Check`、`LIN_OpenNormal_Check`、
`SleepCurrent_Monitor_Check` 等，编译 0 错误。这曾是不确定项，现已排除。

### 3.4 `<export>` 只能是布尔值

写 `<export>none</export>` 会导致 schema 校验失败、**整份 VTT 无法打开**：

```
Element 'export' is unknown.
The value 'none' is invalid according to its datatype 'boolean'.
```

内部函数用 `<export>false</export>`。

### 3.5 原生节点能力（优先使用，不要手写轮询）

| 节点 | 用途 | 关键子元素 |
|---|---|---|
| `awaitvaluematch` | 等待条件成立 | `<timeout>`、`<joincondition>`、`<await_nextupdate>`、`<compare>` |
| `statecheck` | 单次判定 | `<expected><compare>` |
| `wait` | 固定延时 | `<time><value><unit>` |
| `set` | 写变量 | `<in><assignment><sink><source>` |
| `linstopscheduler` / `linstartscheduler` | LIN 调度 | `<network>` |
| `while` | 循环 | `<compare>` + 子步骤 |

**`statecheck` 支持用 `range/based` 一次表达上下界**，不必写两个判定：

```xml
<compare>
  <value><dbobject>…DVM_Voltage…</dbobject></value>
  <range><based>
    <base><variable>目标电压</variable></base>
    <down_tolerance><variable>容差</variable></down_tolerance>
    <up_tolerance><variable>容差</variable></up_tolerance>
  </based></range>
</compare>
```

`timeout`、`wait` 的时长都可以引用参数（`ChParScalar_...`）或本作用域变量。

### 3.6 三种 dbobject 路径写法（写错即编译失败）

```
系统变量：SysVar_BEGIN_OF_OBJECT|1|变量名|命名空间|-1|0|END_OF_OBJECT_SysVar|
参数：    ChParScalar_BEGIN_OF_OBJECT|1|IBS::参数名|END_OF_OBJECT_ChParScalar|
网络：    Network_BEGIN_OF_OBJECT|1|LIN|5|1|END_OF_OBJECT_Network|
```

---

## 四、`.vparam` 多模式取值（Mode 选择器）

### 机制（来自旧工程实测 + 本工程验证）

`ScalarMultiRecord` + `SelectorType` 让同一参数按变体列存多个值：

```
Group	休眠平均电流测试

ScalarMultiRecord

Name	Type	Info	Value
SelectorType	[Mode]		Normal	Test
IBS::SC_Repeats	Auto	每点轮数	3	1
IBS::SC_LinRun_ms	Auto	LIN 保持通讯 ms	60000	2000
```

### 四条硬性规则

1. **`Type` 必须写 `Auto`**，不能写 `Integer`/`Float`（多列记录的值类型由列决定）。
2. 列名必须与 `Mode` 值表一致：`IBSProject.vvarprop` 中定义为 `0=Normal`、`1=Test`。
3. **同一 Group 内可以同时存在多个记录块**（`ScalarSingleRecord` + `ScalarMultiRecord`）。
   已从旧工程 `BatteryChargeDischarge.vparam` 第 20/52 行两处 `ScalarMultiRecord` 之间无 Group 行确认。
4. `PossibleValues` 为空**不影响**列绑定。本工程 `Mode` 的 `PossibleValues` 就是空的，
   但 vTESTstudio Parameters 视图已正确显示 `Normal`/`Test` 两列——此项已验证，不是推测。

### 分列原则（避免把判据放进 Mode）

只有**影响链路快慢**的参数才进 Mode：

| 进 Mode | 不进 Mode |
|---|---|
| 轮数、通讯保持、静置、监控、积分窗口 | 电压点/步长、限流、到压超时、**判据容差**、**平均电流限值** |

判据参数放 Mode 等于允许调试时"放宽判据"，会使测试失去意义。

---

## 五、参数与系统变量

### 系统变量来源

当前工程通过 `SUTSystemVariables` 链接了 5 个外部 `.vsysvar`（均位于旧工程路径，已确认存在）：

- `CAB1500_SysVar.vsysvar`、`Project_SysVar.vsysvar`、`IBS_SignalConvent_SysVar.vsysvar`、
  `4CHRelay_SysVar.vsysvar`、`N8361_SysVar.vsysvar`

其中 `Project_SysVar.vsysvar` 定义了休眠监控要用的 `ResetMeasuredCounter` / `ResetCalc1Counter` /
`ResetCalc2Counter` / `ResetInvalidCounter` / `ResetRxClear`。

**这些文件是绝对路径引用旧工程。若旧工程目录被移动或删除，编译会失败。**

### 帧有效性判据（来自旧工程 `CURRENT_CAL.can`）

| 帧 | 有效条件 |
|---|---|
| `Measured_Data`(0x34) | `ERROR_Common==0 && Resp_Error==0 && ERROR_IDENT==0 && FLAG_INCONSISTENCY==0 && U_BATT!=16383` |
| `Calc_Data_1`(0x35) | `SOC <= 100` |
| `Calc_Data_2`(0x36) | `Q_Charge != 65535` |

正常判定 = 三个有效计数各增长，且 `ResetInvalidCounter` 不增长。

---

## 六、设备函数注意事项

### `PWR_Configure` 的互锁

原实现要求"输出必须已关"才允许配置，**已按需求删除**——N8361 输出开启时可改设定值。
现仅保留安全约束：`Power_RelayCrtl::BatteryConnectEquipment` 必须为 0（禁止自动接通真实电池）。

因此循环体里**不需要**每轮先 `PWR_Off_Check`。

### 携带的既有约束

- `PWR_Configure`：电压须在 `TB_BatteryMin_V`~`TB_BatteryMax_V` 且 10~15.5 V；充放电限流 0~11 A
- `RELAY_Set`：只支持 SAFE=0 / IDLE=1，Battery 必须 0，且须输出已关、DVM 低于切换阈值
- `LIN_OpenNormal`：启动前 `WakeNodeEnable` 必须为 0

以上都是写入语义或安全互锁，不要当"参数校验"删除。

---

## 七、效率教训

1. **先读文件再动手**。本任务中多次因凭印象写 XML 而导致返工。
2. **改结构前先备份**。已用备份恢复过：`.vtt`（3 次）、`.vparam`（2 次）、`.can`（2 次）。
3. **一次只改一类内容并立即编译**。参数改多列、VTT 改结构同时做，出错时无法定位。
4. **不确定的东西先做最小验证**。例如"Test Case 内能不能用 `<caplfunction>`"，
   用一个小用例编译一次即可确认，不必整份重写。
5. **不要声称"编译通过"除非看到日志原文**。增量构建的 `is up to date` 不等于编译成功。

---

## 八、当前工程状态快照

| 项 | 状态 |
|---|---|
| Test Tree | `工作电流测试 → 休眠平均电流测试`（`SleepCurrentTest`） |
| 序列结构 | Preparation `PHASE_Prepare` → 5 个 Test Case 调用（10/11/12/13/14 V）→ Completion `PHASE_Complete` |
| Test Case | `SleepCurrent`，参数 `OutPutVoltage`，循环 `SC_Repeats` 轮，约 20 个可见步骤 |
| 变量 | `Repeat`（轮次）、`WindowSeconds`（积分窗口秒数下限） |
| 监控函数 | `SleepCurrent_Monitor_Check()`，判三帧有效计数增长 + 无效计数不增 |
| 参数分列 | 固定 8 个 + Mode 5 个（`Repeats`/`LinRun`/`LinMonitor`/`SleepWait`/`IntegrationWindow`） |
| 编译 | 三个文件均 0 errors 0 warnings |

**尚未验证**：台架实跑、`awaitvaluematch` 超时是否自动判失败、CANoe 中 CAB1500 采样节点是否加载。
