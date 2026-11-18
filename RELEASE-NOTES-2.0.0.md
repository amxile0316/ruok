# RUOK 2.0.0 发布说明

RUOK 2.0.0 是本分支脱离上游版本号后的第一个正式版本，基线为 OpenTake Standard 1.1.3（上游标签 `desktop-v1.1.3-2026111001`，提交 `9af1599`）。从这一版起，`package.json` 走独立版本线，关于页显示「RUOK 2.0.0（基于 OpenTake Standard 1.1.3）」，上游基线只在 `src/settings/ruok-version.ts` 的 `UPSTREAM_BASELINE` 维护一处。

本版以功能补齐和视觉统一为主，**未提供安装包**：当前构建环境缺少 Visual Studio C++ 生成工具（MSVC x64 与 Windows SDK），`npm run build:native` 不可用，因此没有出 Windows 安装程序，也没有可下载的成品。

## 改名与品牌

- 包名 `opentake-standard` → `ruok`，应用名、窗口标题、菜单、托盘、安装器文案统一为 RUOK；应用标识 `top.ruok.app`，用户数据目录 `%APPDATA%/RUOK`（macOS 为 Application Support/RUOK），工程目录改为 `RUOK Projects`。
- 换用 RUOK-2 问号母版（1254×1254 透明底，砂岩/赭石浮雕问号，表面带赭红岩画纹样）重出全套图标：Windows `ruok.ico`（16–256 共 7 档）、macOS `ruok.icns`、`ruok-icon-*.png`、顶栏 `ruok-mark.svg` 与安装器侧边图，均由 `scripts/generate-ruok-icons.mjs` 生成。
- 首页背景影片 `studio-faders.mp4` 与海报帧按新母版重新烘制，问号按高度 440 落位，光束透明度与问号受光相乘，保留「光束扫过问号被照亮」的联动，不再在运行时叠加滤镜。
- 移除 22 个上游首页入口动图与旧 T 字形素材；`NOTICE`、`TRADEMARK.md`、`RUOK-PROVENANCE.md` 记录分支来源、商标边界与全部修改位置。

## 三套主题

主题切换器从两档扩到三档，文案为「深色 / 浅色 / 烟褐」，取值收敛为 `original | warm | umbra`；旧的 `frost` 归一到 `warm`，旧的 `dusk` 落到 `umbra`，未知脏值回落 `original`，避免升级后人停在半套配色。

- **深色（original）**：墨绿底配金，唯一强调色 `#d8a05e`；正文柔金 `#edd6a8`、次要文字 `#bb9a63`，方框与按钮改为带内高光与外晕的金色描边，而不是纯色硬边。
- **浅色（warm）**：中性石灰灰。底 `#cfcfcf`、面 `#e0e0e0`、抬升 `#eaeaea`、字段 `#d5d5d5`、媒体槽 `#c6c6c6`，文字与发丝线按同族明度递降；强调金压到古铜 `#7a5f2f`，只留在主按钮、选中态与焦点环。
- **烟褐（umbra）**：介于深色与浅色之间的暖褐中调。底 `#57524c`、面 `#625c55`、抬升 `#6b645c`、下沉 `#4c4842`、深槽 `#494540`，文字 `#f2ece2` 一族四档，强调为砂岩金 `#c39a63`。这一档早期试做的是石板绿（暮石），因偏绿被否掉，最终改为暖褐，金属色与底色同属暖色轴。

三套都遵守同一约束：每页不超过三种颜色，层次靠同色系明度分档，发丝线只作辅助。阴影、焦点环、滚动条、原生勾选与滑块里的绿调全部改成中性，金不再扩散到 KPI 数字、编号、小标题与表单描边。

## 新接入的五个模块

- **口播剪辑（`/talk`）**：按逐字稿拆句、对齐音轨，输出静音与口误的剪切清单，并可导出 SRT / VTT 字幕；服务端新增 `/api/talk` 与 `server/talk-place.ts`。首页 QuickEdit 由占位卡改为进入口播剪辑的入口。
- **文案发布（`/publish`）**：调用本机已接通的智能体，按平台生成文案，`publishCopy` 已加入智能体模块清单。
- **运营分析（`/analytics`）**：录入作品数据，给出单条作品面板与归因视图。
- **智能选题（`/topics`）**：用本机规则按关键词、平台、角度生成标题与结构大纲，可复制、可存入选题篮，不依赖外部接口。
- **链接读取（`/reader`）**：`/api/reader/read` 抓取正文，只允许 http(s)、拦截内网地址、手动跟随跳转并复检、15 秒超时、2MB 上限。
- **动效库（`/motion`）**：12 个纯 CSS 动效的实时预览，可复制 keyframes。

以上模块全部注册进 `modules.ts`、`App.tsx` 与模块图标，并统一走新的主题令牌。

## 风格库

- 新增 **product-promo** 风格：一套 20 秒产品宣传片模板，含开场钩子、产品特写、功能演示、转场、结尾 CTA 五段 composition，附静音预览资源；风格总数 56 → 57，可用 10 → 11。
- 风格卡新增星标收藏、「只看收藏」筛选与最近打开胶囊，仅在本机按风格 id 记录，不改动风格数据本身。
- 顺带修掉浅色主题下星标被全局按钮样式覆盖而不可见的问题；服务端风格校验提示改为「本分支提供的风格」。

## 移除 Pro 入口与更新通道

- 删除 Pro 升级入口、风格购买弹窗与 Pro 工作模块，不可用风格统一显示「本分支未包含」；`/pro/:id` 路由与相关按钮一并移除。
- `upgrade.json` 的 `endpoint` 置空，更新通道保持关闭：未配置更新源时不发起网络请求，每日检查直接跳过，不再读取作者仓库或第三方地址。
- 测试护栏相应改写：不再渲染已删除的升级组件，改为扫描残留引用、`/pro` 路由与「未包含」标记，并覆盖「未配置更新源时不联网」与离线降级路径。

## 已知限制

- 本版未产出安装包，缺 Visual Studio C++ 生成工具（MSVC x64 + Windows SDK），`npm run build:native` 不可用；macOS 构建需要 macOS、Xcode Command Line Tools、`iconutil` 与 `hdiutil`，当前环境未验证。
- 没有自动更新：需要自建升级清单 endpoint、签名与回执校验后再启用。
- 发布新安装包前需重新生成并复核 `THIRD-PARTY-LICENSES.json`、`NOTICE`、`licenses/npm/**` 与包内 notices。
- `screenshots/*.png` 仍为上游界面截图；部分上游文档（`AGENTS.md`、`WINDOWS-*.md`、`DOWNLOAD-STATS.md`、`BUILD-MACOS.md`）仍保留旧产品名与作者下载说明。
- 内部 `opentake-*` 事件名、storage key 与 `OPENTAKE_*` 环境变量为兼容保留，未做全量重命名。

## 许可

RUOK 是 OpenTake Standard 的修改版本，按 AGPL-3.0-only 分发；OpenTake 名称与 T 图标不包含在代码许可内，详见 `LICENSE`、`TRADEMARK.md`、`NOTICE` 与 `RUOK-PROVENANCE.md`。
