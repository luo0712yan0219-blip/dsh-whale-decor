# 发布说明 · dsh-whale-decor

包已经打好并验证过。**先生只需要填 3 个占位符、建仓库、发 PR** —— 下面每一步都有确切命令。

## 现在有什么

| 产物 | 说明 |
| --- | --- |
| `dsh-whale-decor-publish/` | 可直接推成 GitHub 仓库的目录（含 README / LICENSE / 上游声明 / 测试 / 素材流水线） |
| `dsh-whale-decor-0.1.0.tgz` | **308 KB**，npm 格式（`package/` 前缀），内容**严格等于** `package.json` 的 `files` 白名单 |

**验证结果**（都在打包后重跑过）：

- 包内自带的 **52 项测试全过**（host 26 + client 26）—— 去掉背景图后功能完好
- `assets/index.json` 与 `assets/files/` **双向一致**：35 个文件，无缺失、无孤儿
- tgz 里 `test/`、`tools/`、`assets/source/`、`background.webp` **均为 0**

## 我替先生做掉的三个决定（以及为什么）

| 处理 | 原因 |
| --- | --- |
| **不含背景图**（先生选的） | 原图授权未声明。客户端本来就内建降级：`manifest.files['background.webp']` 不存在就整层跳过，主题照常 |
| **删掉 `docs/backdrop-before-after.webp`** | 那是**先生桌面的截图**，放进公开包会泄露桌面。与插件功能无关 |
| **`assets/source/` 不进包** | 4.1 MB 重建输入，运行时不需要。包从 4.5 MB 降到 **308 KB** |

另外：`revision` 从 `a3a5ece46e91` 重算为 **`0a186f0f6210`** —— 它指纹的是"产物文件名 + 字节大小"，
删了文件还留着旧值就会指着一个包内不存在的东西。

**README 也中性化了**：15 处「先生」→「你」，去掉了本机 URL，加了「安装」与「自备背景图」两节，
授权一节改写为与包内实际内容一致。仓库结构表里明确标注了哪些文件**只在仓库、不在 npm 包**。

## 署名（已填好）

```jsonc
// package.json
"author": "RIAN",

// LICENSE 第 3 行
Copyright (c) 2026 RIAN
```

版权行与作者名一致就是标准做法 —— 版权持有者即作者本人。
**tgz 已按这两个值重打过并解包核对过**，先生不需要再动。

## 还差一件事：GitHub 仓库

市场条目需要一个 GitHub 地址，所以**建仓库是进市场的前置条件**。
**现在先不加 `repository` 字段**：npm 会校验这个 URL，填了占位符会让 `npm publish`
直接失败，而不填是完全合法的。

仓库建好后，把下面两行加进 `package.json`（我可以一条命令加上）。
注意 `<你的 GitHub 用户名>` 要换成**账号名**，它不一定与作者名 `RIAN` 相同：

```jsonc
"repository": { "type": "git", "url": "git+https://github.com/<你的 GitHub 用户名>/dsh-whale-decor.git" },
"homepage": "https://github.com/<你的 GitHub 用户名>/dsh-whale-decor#readme",
```

> `dsh-whale-decor` **这个名字在 npm 上可用**（已查，404）。npm 名字先到先得，建议尽早占。

## 三条发布途径（任选，可叠加）

### A. 发到 npm（市场 install 命令最简洁）

```sh
cd dsh-whale-decor-publish
npm publish            # 会自动重新打包，用的就是 files 白名单
```

装：`dsh plugin --profile <profile> add dsh-whale-decor`

### B. 推到 GitHub

```sh
cd dsh-whale-decor-publish
git init && git add -A
git commit -m "dsh-whale-decor 0.1.0"
git branch -M main
git remote add origin https://github.com/<你的用户名>/dsh-whale-decor.git
git push -u origin main
```

装：`dsh plugin --profile <profile> add github:<你的用户名>/dsh-whale-decor`

### C. 用现成的 tgz

把 `dsh-whale-decor-0.1.0.tgz` 传到任一可直链的地方（GitHub Release 附件最稳），然后
`dsh plugin --profile <profile> add <那个 tgz 的 URL>`。

## 进插件市场：**去 registry 提 PR**

市场自己的 README 写得很明确（我原文抄下）：

> **This repo is the market app, not the catalog.** The plugin list comes from the curated
> [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) registry —
> to get your plugin listed in the market, open a PR **there**（一条 entry；站点和市场的 CI
> 会自动收录，通常一天内）。**不要**往 dsh-market 那个仓库提插件条目。

registry 就是一份 README，按分类列条目，格式：

```md
- [owner/repo](https://github.com/owner/repo) - One-line description in English.
```

**先生这条（草稿，可直接粘贴）** —— 归到 **Themes & Appearance**：

```md
- [<你的用户名>/dsh-whale-decor](https://github.com/<你的用户名>/dsh-whale-decor) - Deep-sea whale-blue reskin for the DSH Web GUI: 14 theme tokens in light and dark, five whale-tail-maid placements, a clock and weather card, and a collapsible hardware readout (CPU, memory, GPU, per-drive temperatures via HWiNFO). No backdrop image is bundled; drop your own in. MIT code, MIT character art.
```

**收录门槛**（原文）：`dsh plugin add` 装得上、一行描述与实物相符、分类正确、有人维护。
"Every submission is checked against its own source before merging — if a description claims
'46 tools', someone counts them." 所以上面这条描述里每个数字都请先生核一遍：

- 「14 theme tokens」—— README 表格里是 14 个 alias token ✓
- 「five placements」—— 侧栏头像 / 首屏立绘 / 浮空挂件 / 时钟卡片 / 硬件悬浮窗 = 5 处 ✓
  （另有输入框签名与回复贴纸 2 处，**没写进描述**，因为它们在描述里会让数字变模糊）
- 「collapsible hardware readout」—— 有，`▴/▾` 折叠加 `◢` 缩放 ✓

## 一件先生必须知道的事

**硬件读数那条路由会调 PowerShell / nvidia-smi**（`src/hwstats.js`）。
它在本机是好的，在别的机器上会**优雅降级**（读不到就是 `null`，界面显示「未接入」，不伪造 0）。
但如果审核方在 Linux 上跑，`powercfg` / `nvidia-smi` 都不存在 —— 那时它同样只是显示「未接入」，
不会报错。这一点我认为不需要在描述里写，但先生可能想加一句。
