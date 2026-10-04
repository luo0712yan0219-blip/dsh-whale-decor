# dsh-whale-decor · 深海鲸蓝 UI 装饰

给 **DSH Web GUI** 做的一层个性化装饰：

1. **深海鲸蓝主题换肤** —— 14 个 alias token 全量覆盖，亮/暗两套
2. **鲸尾女仆角色元素** —— 5 处挂载点
3. **时钟 + 天气卡片**，以及**可上下伸缩的硬件状态悬浮窗**（收起只留标题+实时读数）
4. **可选背景图** —— 本包**不含**背景图，放一张你自己的即可（见下）

做成正式 client 插件，可从插件管理器启停、卸载，不影响 shell 自身。

## 安装

```
dsh plugin --profile <你的 profile> add dsh-whale-decor
```

装完在 **设置 → 插件** 里启用，再刷新页面。侧栏底部有装饰总开关，可整体关掉。

## 背景图（可选）

本包**刻意不含**任何背景图（作者的私人图不随包分发，见
[`assets/ATTRIBUTION.md`](assets/ATTRIBUTION.md)）。没有它一切照常，只是主题背后没有照片。

想用自己的图：

1. 把图片放到 `assets/files/background.webp`
2. 在 `assets/index.json` 的 `files` 里加一条：

```json
"background.webp": { "type": "image/webp" }
```

素材路由走的是这份白名单，**没登记的路径读不到** —— 加上这一条才会生效。

> **本文档的其余部分描述作者的完整工作树。** npm 包里只有运行时需要的文件
> （`src/`、`lib/client.js`、`assets/files/`、`assets/index.json`、两份授权说明）；
> `assets/source/`（4.1 MB 重建输入）、`tools/`（素材流水线）、`test/` 都**只在仓库里**，
> 不在包里。

```
dsh-whale-decor/            （npm 包内容）
├─ lib/client.js              客户端半：两套主题层 + 1 套背景 CSS + 7 处插槽注册
├─ src/index.js               宿主半：素材路由 + 硬件读数路由
├─ src/hwstats.js             宿主半：硬件读数采集（os/fs + nvidia-smi/powercfg）
├─ assets/index.json          素材白名单（build 产物，同时是路由的授权表）
├─ assets/files/              素材本体 35 件 / 376 KB（build 产物）
├─ assets/ATTRIBUTION.md      素材授权说明
├─ assets/dsh-pet-LICENSE.txt 上游 MIT 声明（派生素材必须随附）
├─ LICENSE                    源码 MIT
└─ cordis.patch.yml           bundle 装载条目

（以下只在仓库里，不在 npm 包内）
├─ assets/source/             build 输入：源帧 + 背景图原件（4.1 MB）
├─ tools/build-assets.py      素材流水线（可复现）
└─ test/                      host / client 两套测试，共 52 项
```

## 一、主题换肤

用 `ctx.theme.overrideTokens(source, tokens)` 叠 token 层，**不改内置主题**：卸载或关掉开关即原样恢复。14 个 alias token 全部覆盖亮/暗两套。

| 分组 | token | 暗色 | 亮色 |
| --- | --- | --- | --- |
| 背景 | `--dsw-alias-bg-base` | `#0a1524` | `#f2f7fd` |
| | `--dsw-alias-bg-layer-1` | `#101e31` | `#ffffff` |
| | `--dsw-alias-bg-layer-2` | `#16283f` | `#e8f1fb` |
| | `--dsw-alias-bg-overlay` | `#142438` | `#ffffff` |
| 边框 | `--dsw-alias-border-l1` | `#1d3350` | `#d6e4f2` |
| | `--dsw-alias-border-l2` | `#2a4a70` | `#b5cbe3` |
| 品牌 | `--dsw-alias-brand-primary` | `#4d9dff` | `#1f6fd0` |
| 文字 | `--dsw-alias-label-primary` | `#eef6ff` | `#0c2036` |
| | `--dsw-alias-label-secondary` | `#c6daf0` | `#4a6785` |
| 状态 | `--dsw-alias-state-error-primary` | `#ff6b81` | `#d6455d` |
| | `--dsw-alias-state-idle-primary` | `#4a6a8f` | `#8ba6c4` |
| | `--dsw-alias-state-success-primary` | `#3ddc97` | `#128f63` |
| | `--dsw-alias-state-warn-primary` | `#ffc46b` | `#b8791a` |
| 侧栏 | `--dsw-specific-sidebar-fill` | `#0c1a2b` | `#e9f1fa` |

改色只需编辑 `lib/client.js` 顶部的 `TOKENS`。

## 二、背景图（为什么不能只设一张图）

**给 `<html>`/`<body>` 设背景图是看不见的**——DSH 的侧栏、主面板、输入框全是不透明表面，会把图整个盖住。所以背景是一套三层结构：

1. 原图 `cover` 铺满（`background-attachment: fixed`）
2. **scrim** —— 一层渐变压暗，保证文字在图上任何位置都读得清
3. **只把 5 个"表面类" token 改成半透明**（`bg-base` / `layer-1` / `layer-2` / `bg-overlay` / `sidebar-fill`），让图透出来；边框、文字、状态色保持不透明实体色

`--dsw-alias-bg-overlay` **故意留 95% 不透明**：菜单和浮层会落在图的任意位置，不能拿文字对比度换通透。

透明度不是拍脑袋定的，约束来自**文字对比度**，不是口味。按 sRGB 反解：要让正文在侧栏所压的那块最亮水面（亮度 233）上仍有约 4.5:1，文字背后的合成亮度就必须 ≤102/255；再让 scrim 尽量小以保住照片层次，暗色面板就落在 0.52 附近。

| | 亮色 | 暗色 |
| --- | --- | --- |
| `bg-base` | `rgba(242,247,253,.52)` | `rgba(10,21,36,.52)` |
| `bg-layer-1` | `rgba(255,255,255,.60)` | `rgba(16,30,49,.56)` |
| `bg-layer-2` | `rgba(232,241,251,.56)` | `rgba(22,40,63,.54)` |
| `sidebar-fill` | `rgba(233,241,250,.48)` | `rgba(12,26,43,.60)` |
| `bg-overlay` | `rgba(255,255,255,.95)` | `rgba(20,36,56,.95)` |
| scrim `--dsh-whale-scrim` | `rgba(8,18,34,.08)` | `rgba(4,10,20,.06)` |

三个反直觉的点，都是实测出来的：

- **scrim 才是"看不看得见图"的主要杠杆**，不是面板透明度。它把整张照片——包括没被面板盖住的缝隙——一起乘暗。第一版 scrim 给到 .26、面板 .66，结果整屏是一团深蓝，角色几乎认不出；把 scrim 降到 .06、面板收到 .52，图才真正读得出来。
- **侧栏正压在本图最亮的一列上**，是五个表面里对比度余量最紧的。它在 .56 时反而比主面板更亮，把"侧栏是深色列"的层次弄反了；收到 .60 后合成亮度与主面板接近，整块界面更整体，变化交给照片提供。
- **暗色的两个文字色被特意调亮**（`label-primary` → `#eef6ff`，`label-secondary` → `#c6daf0`）。这是为背景可见度付的代价——让步的是文字这侧，而不是把面板重新调实。

改前/改后对照见 [`docs/backdrop-before-after.webp`](docs/backdrop-before-after.webp)（**设计稿模拟，不是应用截图**）。

scrim 用的是自定义 token `--dsh-whale-scrim`，CSS 里带 fallback，所以即使将来主题层拒绝未知 token 名，背景也只是退回固定 scrim，不会整体失效。

注入规则写的是 `:root, :root body` 而**不是** `html, body`：`body` 单独选择器特异性只有 (0,0,1)，一旦 shell 自己写了 `html body { … }`（0,0,2）就会压过它，背景直接不出现。

**换背景图**：把新图覆盖 `assets/source/background.jpg`，重跑 `tools/build-assets.py` 即可。`revision` 指纹会自动破掉浏览器缓存。

## 三、插槽挂载点：7 处

| 插槽 | 内容 | 组件 |
| --- | --- | --- |
| `sidebar.brand.mark` | 侧栏头像（替换 shell 自带鱼标） | `BrandAvatar` |
| `conversation.hero.brand.mark` | 空白会话首屏立绘 | `HeroArt` |
| `shell.overlay` | 右下浮空挂件（31 帧循环） | `FloatingCompanion` |
| `shell.overlay` | 大时钟 + 天气卡片 | `DecorPanel` |
| `shell.overlay` | 硬件状态（可上下伸缩，见「六」） | `HwMonitorPanel` |
| `conversation.composer.dock` | 输入框下方签名贴纸 | `ComposerSignature` |
| `conversation.chat.assistant-actions` | 每条助手回复尾部的表情贴纸（可点） | `ReplySticker` |
| `sidebar.footer.action` | 装饰总开关（常驻，不受开关自身影响） | `DecorToggle` |

尺寸集中在 `GEOMETRY`，一处改完刷新即可。收起侧栏（56px 导轨）时开关会自动只留图标。

### 常驻悬浮窗：大时钟 + 天气

一个**一直挂在界面上**的玻璃悬浮窗：**大时钟**（本地时间，每秒刷新）+ **天气**（当前温度 / 天气现象 / 今日最高最低 / 湿度 / 风速）。

**操作**（几何全部持久化，下次打开还在原处）：

| 想做什么 | 怎么做 |
| --- | --- |
| 移动 | **拖卡片任意非控件处**（时钟上、空白处、右上角 `⠿` 都可以）；键盘聚焦 `⠿` 后方向键微调，`Shift`+方向键走大步 |
| 缩放 | 拖右下角 `◢`，比例限制在 **0.6×–2.0×** |
| 换城市 | 点城市名旁的 `✎` |

按钮和输入框各自保留自己的手势，不会被拖动吃掉（判定规则见 `NO_DRAG_SELECTOR`）。

- 位置存在 `localStorage['dsh-whale-decor:panel']`，**加载时会钳进视口**——上次之后窗口变小了，窗口也不会被丢在屏幕外。
- 默认落在界面中部（`left: 50%` / `top: 44%`），拖一次就记住。

**为什么注册在 `shell.overlay` 而不是 hero 的品牌位。** `conversation.hero.brand.mark` 是个由 ownerProps `{ size }` 驱动的**方形品牌槽**，而且只在空白会话渲染——把悬浮窗塞进去，它既改不了大小也活不出新会话。所以走 `shell.overlay`（`dsh-whale-decor-panel`，order 920），几何完全自管。

#### 天气数据

用 **Open-Meteo**：免费、**不需要 API key 或账号**，而且响应带 `Access-Control-Allow-Origin: *`，所以页面直接调它，不必再经宿主半转发。

- **城市要自己设一次。** 城市属于用户、存在这个浏览器里（`localStorage['dsh-whale-decor:weather']`），没有任何合理的默认值——所以第一次打开卡片会显示「设置城市」，填一次就记住；解析出的经纬度也一并存下，**下次不再重复地理编码**。
- 每 **15 分钟**自动刷新一次，失败会自己重试。
- 天气现象按 Open-Meteo 返回的 **WMO 天气代码**映射成中文（晴 / 局部多云 / 雷阵雨伴冰雹…），映射表在 `WEATHER_CODES`。

## 四、开关

- **总开关**：侧栏底部 Settings 旁边的「鲸鱼娘」按钮。关掉会**同时注销全部插槽 + 撤掉所有主题层 + 移除背景 CSS**，UI 回到 shell 原样；选择存在 `localStorage['dsh-whale-decor:enabled']`。
- **开关自己常驻**：它不在受控集合里，否则关掉之后就再也开不回来了。
- **插件级启停/卸载**：设置 → 插件（`dsh-whale-decor`）。

## 五、素材从哪来 / 怎么重建

角色立绘不是手绘的，是 **MIT 授权**的 whale-tail maid（上游 `PC2005-cloud/dsh-pet`）；背景图是你自己给的。

**源帧已经固化在本仓库里**：`assets/source/frames/`（243 个文件 / 约 3.6MB —— 完整的 `idle` clip 241 帧 + `head_pat_001` + `eat_token_060`）。流水线只读这里，**不再依赖任何已安装的插件**。

> 这里踩过一次坑，记下来免得重犯：一开始只想省体积，把 `idle` 抽成每 8 帧一张（31 张）就固化了。结果脚本自己还会再抽一次步长 8 —— 31 张只剩 4 张，产出从 36 个文件掉到 9 个。**固化必须是完整的 clip**，抽帧是流水线的职责，不是源的。

```powershell
# 需要带 Pillow 的 Python（DSH 自带运行时即可）
<python> tools\build-assets.py

# 也可以临时换源（比如从别处的完整帧集重建）
<python> tools\build-assets.py --source <含 idle/ 等 clip 的目录>
```

产出 **36 个文件 / 约 368KB**：头像、立绘、两张贴纸、31 帧挂件序列、背景图（1920px / 113KB）+ 白名单 `assets/index.json`。

**可复现性已验证**：换成固化源后重跑，`assets/index.json` 里的 `revision` 指纹仍是 `a3a5ece46e91`，与换源之前**完全一致** —— 说明这 243 个源文件与原始来源逐字节等价。

改构图：`HEAD_BOX`（头像/贴纸裁剪框）、`FLOAT_STRIDE` / `FLOAT_WIDTH`（挂件抽帧与宽度）、`BACKGROUND_MAX_WIDTH`。

授权细节与"刻意没用哪些素材"见 [assets/ATTRIBUTION.md](assets/ATTRIBUTION.md)；旧的 BigFish 帧是限制授权，流水线**从不读取**。

## 六、硬件状态悬浮窗

`shell.overlay` 上的第二个浮窗（`dsh-whale-decor-hw`，order 940，压在时钟卡片之上）。

**三种手势，几何全部持久化**（存在 `localStorage` 的 `dsh-whale-decor:hw`）：

| 手势 | 怎么做 |
| --- | --- |
| **移动** | 整张卡片都能拖（不只手柄）；聚焦左下 `⠿` 后用方向键微调，Shift 加速 |
| **上下伸缩（折叠）** | 点标题栏右侧 `▴ / ▾`。**收起时四枚读数照样在**，所以收起来是"少看细节"，不是"看不见数据" |
| **自由缩放** | 拖右下角 `◢`（离卡片中心越远越大）；或聚焦它按 `]` 放大 / `[` 缩小，Shift 加速 |

**缩放范围 0.5×–3×**，比时钟卡片的 0.6×–2 更宽——遥测条本来就是给"隔着桌子瞄一眼"用的。
`transform: scale()` 会连字号一起放大，所以是真的整体调大小，不是只有外框。

卡片的**默认尺寸也调大了**（宽度 300→340px、字号 11.5→12.5px）：你反馈"界面太小"，
那就该改默认值，而不是只给个手柄让你自己去拉。

拖拽手柄在**左下**、缩放手柄在**右下**，两个手势不共用一个角，不会误抓。

### 显示的指标，以及数据来源

| 指标 | 来源 | 说明 |
| --- | --- | --- |
| CPU 占用 · 核数 | `os.cpus()` 增量 | 零依赖，无需子进程 |
| 内存 已用/总量 | `os.freemem/totalmem` | 零依赖 |
| GPU 占用 · 显存 · 温度 | `nvidia-smi` | 每次轮询一次短命子进程；非 NVIDIA 机器为 null |
| 硬盘 各卷 已用/总量 | `fs.statfsSync` | 零依赖；**自动枚举 A:–Z: 上所有已挂载卷** |
| 性能模式 | `powercfg /getactivescheme` | 华硕把 Armoury Crate 的模式做成电源方案：`Turbo` / `Performance` / `Slient` / `PD_Turbo` |
| 运行时长 | `os.uptime()` | 零依赖 |
| 风扇转速 · 硬盘温度 | HWiNFO 的 Gadget 注册表 / LibreHardwareMonitor 的 WMI | **需要本机跑着其中一个**；装了自动出现，都没有则显示"未接入"。见下 |

刷新：展开 2 秒、收起 5 秒；页面不可见时**完全不请求**（免得为没人看的数据反复起子进程）。

#### 卷列表是枚举出来的，不是写死的

最初这里写死了 `['C:', 'D:']`，结果把本机真实的 **F: 和 H:** 两个卷整个漏掉了
（你发现少了一个盘）。现在改成**探测 A:–Z:**，实测 26 个盘符一轮 **0 ms**，所以枚举是默认行为：

- 结果按盘符排序，重复盘符不会出现；
- 列表**缓存 30 秒**：已映射但离线的网络盘可能让自身探测变慢，不该每 2 秒付一次这个代价；
  新插上的卷最迟 30 秒内出现；
- `config.hw.drives` 仍可显式指定（例如 `['C:']`）来覆盖枚举。

`test/host.test.mjs` 里有一条测试用**独立探针**做对照（自己扫一遍 A:–Z: 再和路由返回值比对），
所以在没有盘符的机器上也不会误报。

### 三个读不到的东西（如实说明，不编数字）

#### 1. 风扇转速 —— 奥创能显示，本插件读不到，原因在这里

你指出奥创（Armoury Crate）里能看到风扇。**它确实能，数据也确实在这台机器上** ——
但奥创走的是插件走不了的那条路。我把所有可达入口都试过一遍（两轮排查的完整结果）：

| 试过的入口 | 结果 |
| --- | --- |
| `Win32_Fan` | 返回空（笔记本常见） |
| `Win32_TemperatureProbe` | 返回空 |
| `MSAcpi_ThermalZoneTemperature` | **拒绝访问**（需提权；本 shell 未提权，且插件用同一个 token） |
| `MSStorageDriver_FailurePredictData` / `ATAPISmartData` 等 | **「不支持」** —— 存储驱动没提供这个 WMI 通道（不是权限问题） |
| `root\WMI:AsusAtkWmi_WMNB` | **类存在，实例数 = 0**；用正确 `[uint32]` 重试仍是「无效的方法参数」 |
| `root\WMI:AsusHWMonitorWMI` | **类存在，实例数 = 0** → `getTotalSensorValues` 调不动 |
| **全部 WMI 命名空间**（递归枚举 `__NAMESPACE`） | **没有厂商命名空间**，只有标准 Windows 的那些 |
| PnP 设备 | 本机**没有 ATK 设备**，只有新的 `ASUS System Control Interface v3`（`ACPI\ASUS2018`，状态 OK）← 这解释了为什么旧的 ATK WMI 类是空的 |
| `AsusWinIO64.dll`（奥创自带） | 存在，但只导出 **`InitializeWinIo` / `ShutdownWinIo`** —— 是 **WinIO 端口 I/O** 包装，用它得**自己加载内核驱动**，且仍需型号专用的 EC 寄存器地图 |
| 奥创的 SQLite（`ArmouryCrate_v1.5.db`） | 只有**用户行为埋点**（`HyperFan_Mode` 是列名，不是读数） |
| 奥创的诊断日志 | 只有**风扇配置**行（`FanHysteresis[0..3]`、`SetFanTuningValue`），**没有任何 RPM 数值** |
| 奥创的 localhost 端口（9012/9013/9014/50100/13031…） | 都不是 HTTP，是内部 socket 协议 |

**为什么奥创能、我不能**：奥创带着**签名的内核驱动**，用**原生代码** `DeviceIoControl` 直接读 EC。
而本插件是 DSH 里的 **JavaScript**：Node **没有 `DeviceIoControl`**，只能走
(a) 有文档的 Win32/WMI，或 (b) 把活交给另一个带驱动的程序。

所以这是**能力边界，不是没找对 API**。

> **我特意没有做的事**：猜 EC 寄存器和 IOCTL 码去直读。寄存器地图是**主板型号相关**的，
> 而且 EC 里有些是"读一下就改状态"的命令寄存器 —— 盲扫不是慢，是危险。
> 这个风险我不替你承担。
>
> 机器型号是 **FA608UH**（ASUS TUF Gaming A16），可作为将来查寄存器映射的线索。

#### 1b. 那怎么办：跑一个"知道这块板子"的辅助程序

插件内置了**两个**传感器提供方，**装了哪个就用哪个，不用改代码**：

| 提供方 | 怎么接 | 需要什么 |
| --- | --- | --- |
| **HWiNFO**（推荐） | 它的 **Gadget** 功能把选中的传感器镜像到注册表 `HKCU\Software\HWiNFO64\VSB` —— 这是**公开的第三方集成接口**（Rainmeter 等就是这么读的）。插件用 **纯注册表读取**，**不需要提权、不需要我碰驱动** | HWiNFO + 在 Sensors 里开启 Gadget 并勾选要上报的传感器 |
| **LibreHardwareMonitor**（开源） | 它跑起来后会注册 `root\LibreHardwareMonitor` WMI 命名空间，插件直接读 | LHM 以管理员运行 |

推荐 HWiNFO：它的硬件覆盖最广，**最可能认得出 FA608UH 的风扇和两块 NVMe 的温度**。
两个都没有时，那一行如实显示「未接入」，**不编数字**。

##### HWiNFO 已装好（便携版）

已下载官方便携版并解压到（**已验签：REALiX s.r.o. 的 EV 证书，Valid**）：

```
C:\Users\12118\AppData\Local\HWiNFO\HWiNFO64.exe     ← 用这个
```

##### 开启 Gadget 的步骤（照 [Rainmeter 圈的标准指南](https://github.com/SilverAzide/Gadgets/wiki/HOW-TO-Configure-HWiNFO) 来）

你的 HWiNFO 是**中文界面**，而那份指南是英文的，所以下面每一项都给出「中文界面里长什么样」。
**关键锚点是 `Gadget` 这个词和图标位置**——即使译名与下面不同，按位置也能找到。

| 英文（指南里的词） | 中文界面上找 |
| --- | --- |
| Sensors-only | 「仅传感器」——欢迎页上勾它，然后点开始 |
| 托盘右键 → Sensors | 托盘图标**右键**，菜单里选「传感器」 |
| **Configure Sensors** | 传感器窗口**最底部那一排按钮的最右边那个**（齿轮/扳手图标） |
| General tab | 对话框第一个页签「常规」 |
| **Show all fans (including stopped or not present)** | 常规页里含「**显示所有风扇**」字样、后面带括号补充说明的那个勾选框 |
| Polling Period → Global → Set | 常规页「轮询周期」区域，把全局改成 `1000`，再点旁边的「设置/应用」 |
| **HWiNFO Gadget** tab | 跳到最后那个**页签标题带 `Gadget` 字样**的页（很可能译作「HWiNFO 小工具」） |
| **Enable reporting to Gadget** | 那个页上的**主开关**（一个复选框，勾上才让下面每项可选） |
| **Report value in Gadget** | 在列表里选中某项后，右侧/下方那个「在 Gadget 中报告数值」复选框 |
| Close and Save Changes | 传感器窗口上的「关闭并保存更改」按钮 |

按这个顺序：

1. **右键桌面上的 `HWiNFO64（管理员）` → 以管理员身份运行**（读传感器/装驱动要提权，UAC 只能本人点）。
2. 欢迎页勾「仅传感器」→ 点开始。
3. 托盘图标右键 → 传感器。
4. 窗口**底部最右边**那个按钮 = 配置传感器。
5. 「常规」页里勾上那个含「**显示所有风扇**」的框 ← **笔记本必勾**，
   否则风扇不转时 HWiNFO 根本不列出它，后面就没得选；顺手把轮询周期设成 `1000`。
6. 跳到标题带 **`Gadget`** 的页签 → 勾上主开关。
7. 在列表里选中要上报的项，勾上「报告数值」（Ctrl / Shift 可多选）：
   - 主板传感器上的 **`CPU` 风扇 RPM**
   - **`GPU` 风扇 RPM**（GPU 传感器或主板传感器，哪个有选哪个）
   - **两块 NVMe 的温度**（Drives / 驱动器 那一段的 `Temperature`）
8. 确定 → 「关闭并保存更改」。

**免费版就够**：不需要 Pro，也不需要开 "Shared Memory Support"。

> ⚠️ 如果 HWiNFO 是用**另一个管理员账户**启动的，注册表写在那个账户下、插件读不到。
> 用你自己的账户提权运行就没这个问题。

##### 解析器怎么认这些值

`parseHwinfo()` 是纯函数，`test/host.test.mjs` 里有七条测试锁住它：

- **单位优先**：`Value<i>` 是带单位的格式化值（`2480 RPM` / `41.5 °C`），**单位不随界面语言变**，
  所以它比标签可靠，先按单位分桶；
- **标签兜底**：单位看不出来时再按标签认，中英都收（`fan|rpm|风扇|風扇|风机|風機|转速|轉速`、
  `temp|温度|溫度`）；
- **兼容两种注册表布局**：官方文档没写死值名，所以既支持 `Label<i>` + `ValueRaw<i>`，
  也支持"值名本身就是标签"——两种布局互斥，不会重复计数；
- 无 `ValueRaw` 时回退到格式化的 `Value<i>`；
- **没有标签的分组必须跳过**——宁可缺一行，也不能猜错一个数。

Gadget 的 index 会随勾选项增减而**重新编号**，但本解析器按标签认，所以你以后改勾选也不会错位。

##### 已跑通（2026-10-04 实测）

你装好 HWiNFO 并开启 Gadget 后，**风扇和硬盘温度都拿到了**。实测读数：

```
风扇  CPU 5600 RPM · GPU 6100 RPM
温度  核心温度 75.2 ℃
      两条 DDR5 的 SPD Hub 温度 59 / 49.8 ℃
      磁盘0 SHGP31-1000GM  56 ℃
      磁盘1 KBG60ZNV512G KIOXIA  43 ℃
```

##### 界面上的几条规则（都是你指定的）

| 规则 | 实现 |
| --- | --- |
| **CPU / GPU 并排，各配一个随转速旋转的风扇** | 叶片是内嵌 SVG（五叶 + 轮毂），颜色跟随主题；转速从 RPM 映射而来，见下 |
| **去掉 Mid** | 本机 EC 报了个机箱里没有的 `Mid` 风扇槽，永远 0 RPM。默认隐藏（`DEFAULT_HIDDEN_FANS`），可用 `config.hw.hideFans` 覆盖 |
| **磁盘只显示每盘一行** | 主机侧 `onePerDrive()` 把每块盘的多个温感收敛成**第一个**（主温感）；SHGP31 原本三行，现在一行 |
| **磁盘编号为 磁盘0 / 磁盘1** | 客户端按出现顺序编号，**盘型号放在该行的 tooltip 里**（悬停可见）。编号按 HWiNFO 列出顺序，本机恰好与 Windows 磁盘编号一致 |
| **内存也编号为 内存0 / 内存1** | 同理：两行 `SPD Hub 温度` 也分不清哪根条子。判定在**客户端**做（`/spd\|内存\|dimm/`），所以这是纯客户端改动，热重载即生效 |

> **SPD Hub 温度是什么**：DDR5 内存条上那颗 SPD Hub 芯片（取代 DDR4 的 SPD EEPROM）自带的
> 温度传感器，也就是**内存条温度**，一根条子一个读数。它是模块 PCB 的温度，**不是 DRAM 颗粒的结温**
> ——颗粒在高负载下会更热，所以这个数适合看**趋势**。DDR5 规格上限约 85 ℃，50–60 ℃ 属于凉快。

**转速的上限是"这块屏能诚实显示多快"，不是"能设多快"**：

五个叶片每 **72°** 重复一次，所以动画**每帧超过约 36°** 就会混叠——眼睛看到的不是更快，
而是车轮效应：风扇**爬行甚至倒转**。于是上限由**刷新率**决定：

| 刷新率 | 最快不混叠 |
| --- | --- |
| 60 Hz | 167 ms/圈 |
| 120 Hz | 83 ms/圈 |
| **165 Hz（你这台）** | **61 ms/圈** |

**刷新率是用 `requestAnimationFrame` 实测的**（`measureDisplayHz()`，12 帧取均值，并夹在 30–360 Hz
之间防止后台节流测出荒唐值）。你这台实测 **165 Hz**，所以 5700 RPM → **113 ms/圈**，
6100 RPM → **61 ms/圈**。（对照你先前看到的固定 300 ms，快了 2.7 倍。）

> **这里踩过一个坑，记下来**：第一版把上限**按 60 Hz 硬编码**，并且**把 `animationDuration` 加在了
> 外层 `<span>` 上**——而动画在内层 `<svg>` 上，所以那个样式**完全没生效**，所有风扇一直吃 CSS 里的
> 固定 fallback。也就是说"按转速转"这件事**整整一版都没实现**，你看到的只是固定转速。
> 现在 `hwFanArt()` **自己拥有自己的全部计时**，就是这个 bug 的直接产物。

**超过旋转上限之后，"快"由运动模糊和涂抹承载**：`blur()` 随负载升到 1.5 px，加一圈随负载渐显的
涂抹盘（`smear`）——这也正是真实风扇在 6000 RPM 下的样子：**不是分明的叶片，而是一团糊开的盘**。

**读到 0 RPM 的风扇不转**（`animationPlayState: paused`）—— 那是事实，不是可以抹掉的舍入误差。
`prefers-reduced-motion` 下完全不转，RPM 数字照常在。

> **叶片刻意做成不完全对称**（`FAN_BLADE_OPACITY`，五个叶片透明度略有差异），
> 削弱那个让眼睛"锁相"的对称性，帮助高速时仍然读成"在转"。

> 折叠态（`▴/▾`）下整个 body 收起，所以风扇图块也随之隐藏；标题栏的四枚读数不受影响。

**HWiNFO 的驱动做到了本插件做不到的事**：`ASUS NB EC: ASUS TX Gaming FA608UH_FA608UH`
这组传感器就是从 EC 读的，而插件（非提权 JS）连物理盘句柄都打不开（Win32 错误 5）。

> 顺带纠正一个我先前猜错的方向：**内存完整性（HVCI）开着并没有拦住 HWiNFO 的驱动**
> （`HWiNFO_216` 正常 Running）。当时我只把它列为嫌疑、没下定论，这是对的。

##### 两个踩过的坑（都是真 bug，都已修 + 有测试）

1. **中文界面下标签靠不住，得靠单位。**
   HWiNFO 给风扇的标签是 `CPU` / `GPU` / `Mid` —— **一个"风扇/RPM"字样都没有**，
   是 `5000 RPM` 这个**单位**把它们认出来的（单位不随界面语言变）。
   所以解析器是**单位优先、标签兜底**。
2. **PowerShell 5.1 的重定向输出不是 UTF-8。**
   中文标签经管道成了乱码，导致**温度整批丢失、只有风扇活下来**（因为 `RPM` 是 ASCII）。
   诊断指纹很典型：`风扇 = 3` 而 `温度 = null`。修法是给每个 PowerShell 脚本加
   `[Console]::OutputEncoding = [Text.Encoding]::UTF8` 前缀（`PS_UTF8_PREAMBLE`）。

另外处理了一个可读性问题：两块 NVMe 都报 `磁盘温度` / `磁盘温度 2`，
**只按标签分桶的话四行分不清哪块盘**。现在重复标签会带上盘名
（`磁盘温度 · SHGP31-1000GM`），而且**同一块盘只要有一行需要标名，整组都标**
（否则会出现"两个带名 + 一个光着"的怪样子）。

**重要：HWiNFO 必须在运行**，而且**传感器窗口要开着**，或按指南用「关闭并保存更改」
最小化 —— 直接点 ✕ 关掉传感器模式就会停止轮询，注册表随即断更
（判断依据：HWiNFO 零窗口 + 6 秒内 CPU 时间 0 ms）。设置里勾 **Auto Start** 可省掉手动启动。

#### 2. 两块 NVMe 的硬盘温度

`Get-StorageReliabilityCounter` 对 **KIOXIA KBG60ZNV512G** 和 **SHGP31-1000GM** 两块盘
**都不返回温度**，其余字段也是空；SMART 的 WMI 通道本机「不支持」；
`MSFT_PhysicalDisk.Temperature` 读到的是 **0**（未上报），偶发值不可信；
按官方文档写的 `DeviceIoControl` 直查 NVMe SMART 日志页则是 **Win32 错误 5（拒绝访问）**。
所以这块只能走 HWiNFO（它以提权身份读、把结果发布到注册表给非提权程序读 —— 那个接口
存在的意义正在于此）。


#### 3. 分贝

**做不了**。消费级 PC 没有声级计硬件，任何"xx dB"都只能是编出来的。
唯一的替代是用麦克风测**环境**噪音——那测的不是风扇声，且未校准，所以没有做。

**设计原则**：读不到就 `null`，UI 显示「未接入」/「—」，绝不显示 0。宿主半的
`test/host.test.mjs` 里有一条断言专门锁这个契约（`body.fans === null` 必须与
`body.sources.sensors !== 'ok'` 同时成立）。

> 装了 LibreHardwareMonitor 之后不用改代码：宿主每 5 秒探一次它的 WMI，
> 发现了就自动多出风扇与温度那些行。装了之后告诉我，我去核对传感器名的映射。

## 七、验证记录

`npm test` —— **32 项全过**（宿主 13 + 客户端 19）：

- **宿主 13 项**：路由形状、manifest 内容、素材字节（WebP 魔数）、未登记名 404、编码穿越 404、跨源 403、同源 200、白名单与实际文件一致、**重建后无需重启即生效**、**注册表缺失返回 503 而非跳过激活**。
  "未登记但存在"这条会在 `files/` 里**真造一个文件**再断言 404，证明授权边界是白名单而非文件系统。
- **客户端 19 项**：模块加载契约、14 个 token 双套色值、插槽注册、list/single 注册字段差异、开关的拆除与恢复、启动即关闭、single 槽夺位优先级、导轨态隐藏标签、背景层叠放顺序与透明度约束、背景 CSS 指向带 revision 的素材且带 scrim fallback、关掉开关时背景一并移除、manifest 无背景素材时不叠背景层、两个 overlay 座位 id 不冲突、悬浮窗不依赖空白会话即常驻、**整卡可拖但控件不被拖动吃掉**、存下的位置与缩放被还原并钳进视口、**没设城市时先问而不是编一个**、**存过城市就跳过提问并显示该城市**、组件全部可渲染。

运行时实测（对着活着的页面用 Inspect 查的，不是推断）：

- 插槽全部 `active`：`-brand`（`priority: -1`，压掉 shell 的 `mf`）、`-hero`、`-float`(900)、`-panel`(920)、`-signature`(20)、`-reply`(40)、`-toggle`(50)，且**无重复注册**
- HTTP：`/manifest` 200 → 含 `background.webp`；`/asset/background.webp` 200 `image/webp`；未登记名与 `index.json` 均 404
- 天气数据源实测：Open-Meteo 预报与地理编码均 200、`Access-Control-Allow-Origin: *`、中文地名可直接搜（"上海" → 上海）
- 音乐插件已卸载：`/dsh-music/state` 与 `/dsh-music/command` 均 **404**，版本豁免已撤销（`exemptions: {}`）

**没能远程验证的一件事**：主题层与背景层是否真的生效，我无法从外部证明。Inspect 的 `Theme` provider 只返回**契约里的 14 个 token**（是契约，不是当前取值；自定义 token 也不会被列出），拿不到实际色值。所以这部分只验到"契约正确 + 插件确实 apply 了"（否则六处插槽不会注册成功），**最终要靠眼睛确认**。真出问题的话，唯一诊断入口是浏览器 Console 里的 `[dsh-whale-decor] ...`。

## 八、几个踩过的坑（改代码前先看）

### 全屏特效别给应用根加 transform（试过"从水里浮出"，已废弃）

做过一版「片头结束后全屏 UI 像从水里浮出来」，效果不好已删除。**但有一条结论值得留着**：

**不要给应用根（`body`／shell 容器）加 `transform` 或 `filter`。** 那会让它成为所有
`position: fixed` 后代的**包含块** —— 本插件的浮窗、`shell.overlay` 的其余占用者、桌宠
都会在动画期间**整体位移**。

当时绕开的办法是：全屏遮罩 + `backdrop-filter`，**扭曲遮罩背后的真实 UI**，应用本身不动。
这个技巧本身没问题（`backdrop-filter` 不建立包含块），只是最终观感不达标。

**1. single 插槽靠优先级夺位，且"数值越小越优先"。**

`sidebar.brand.mark` 已经被 shell 的鱼标以 `priority: 0` 占着。实测：

```
priority  10 -> 注册成功但 active: false，鱼标仍是 active   （头像不出现，界面没有任何提示）
priority  -1 -> active: true，鱼标转 inactive              （头像出现）
```

**2. 开关的生命周期必须和装饰分开。**

`apply()` 里 `switchSeat` 与 `decoration` 是两个独立分组。合并成一个注册列表的话，`sync()` 第一次执行就会把开关自己注销掉——**开关只能点一次，然后消失且无法恢复**。这个 bug 是被测试抓出来的。

**3. 宿主半不会热加载；而且 manifest 曾被缓存在激活时的闭包。**

宿主半原来在 `apply()` 时把 `assets/index.json` 读进闭包，结果**重建素材后运行中的宿主还在发旧 manifest**，新背景怎么刷新都不出现。已改成按请求读取 + 按 mtime 记忆化。

顺带验证出一条有用的操作：**改完宿主半不需要重启 DSH**，在插件管理器里把 `dsh-whale-decor` **停用再启用**，就会从磁盘重新加载 `src/index.js`。（客户端半改动则是 HMR 自动热加载的，连刷新都不用。）

**4. 悬浮窗只把小手柄做成拖拽区等于没有拖拽区。**

第一版把 `onPointerDown` 只挂在右上角 22px 的 `⠿` 上，结果就是"无法拖动"——没人会想到要捏着一个小点才能挪窗口，何况那个字形在缺字体的环境里可能根本不显示。现在**整张卡片就是拖拽面**（`beginMove` 挂在根节点上），只把 `button/input/a/textarea/select` 和显式标了 `data-dsh-decor-nodrag` 的进度条排除掉；`⠿` 降级成提示，`grab` 光标才是真正的可拖暗示。

顺带把 overlay 的指针可达性做成不可能失效：`shell.overlay` 是 click-through 的，只靠样式表里一句 `pointer-events: auto` 可能被同等特异性的 shell 规则压掉，所以面板**同时**在 inline style 里再写一次，并把样式规则标 `!important`。

> **历史记录：装过又卸掉的 dsh-MusicPlayer。** 它曾接过网易云音乐，后来按用户要求整套移除（含我授予的精确版本豁免）。留三条当时的踩坑结论备查：本机**没有 git**，`github:` 源装不了，得从 `codeload.github.com` 拉 tarball 本地装；它声明 peer `@deepseek-ai/dsh-tools@^0.1.0-rc.6`（不含 0.2.x）会被 DSH 兼容门禁拦下，放行前应核实 `defineTool` 在 0.2.0-rc.2 里仍导出；**`link:` 安装的插件在自己的真实路径下解析依赖**，peer 不会被装进去，需要在祖先目录放依赖垫片。相关目录 `_vendor/` 已随插件一并删除。

## 九、回退

```powershell
# 只关装饰，保留插件
点侧栏底部「鲸鱼娘」按钮

# 卸载整个插件
设置 → 插件 → dsh-whale-decor → 卸载
# 或
dsh plugin --profile desktop remove dsh-whale-decor
```

卸载后所有主题层与插槽注册一并撤销，背景 CSS 也会被移除，UI 回到未装饰状态。

## 授权

- **源码：MIT**（见 [LICENSE](LICENSE)）
- **角色素材：MIT** —— 来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)
  （Copyright (c) 2026 PC2005-cloud），完整上游声明随包分发于
  [`assets/dsh-pet-LICENSE.txt`](assets/dsh-pet-LICENSE.txt)。MIT 要求这份声明随派生物一起走。
- **背景图：本包不含** —— 作者自己的背景图授权未声明，因此**不随包分发**。
- **刻意没用**：`dsh-dafeiyu` 归档的旧 BigFish 帧（fan-made / AI 辅助，限制授权）从未被读取。

细节与"刻意没用哪些素材"见 [assets/ATTRIBUTION.md](assets/ATTRIBUTION.md)。
本项目为个人作品，与 DeepSeek 无关联、未获其背书。
