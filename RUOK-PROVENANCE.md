# RUOK 分支来源与修改说明

- 上游仓库：https://github.com/saf1102/opentake-standard
- 上游版本：OpenTake Standard v1.1.3
- 上游标签：`desktop-v1.1.3-2026111001`
- 上游提交：`9af159999bca06c125f767aafd1006348d1d3091`（2026-11-09，README：下载链接换成 1.1.3）
- 版本线：RUOK 自 **2.0.0** 起使用独立版本号（`package.json`），上游基线固定为 OpenTake Standard 1.1.3。基线字符串只在 `src/settings/ruok-version.ts` 的 `UPSTREAM_BASELINE` 维护一次，关于页按 `package.json` 显示「RUOK 2.1.0（基于 OpenTake Standard 1.1.3）」。桌面端、安装包与启动上报均读 `package.json`，更新通道保持关闭。
- 本地目录：`ruok/`
- 本地分支：`ruok/main`（从 `main` 建立，保留完整 Git 历史）
- 改造日期：2026-11-17
- 许可：AGPL-3.0-only（见 `LICENSE`）。OpenTake 名称与 T 图标不随代码授权（见 `TRADEMARK.md`）。

## 1. 分支建立方式

```sh
git clone https://github.com/saf1102/opentake-standard.git ruok
cd ruok
git switch -c ruok/main
```

`origin` 仍指向上游仓库，便于后续查看/合并上游历史；本地迭代在 `ruok/main` 上进行。发布前建议把 `origin` 改名为 `upstream`，并添加自己的发布仓库为 `origin`。

## 2. 修改范围

所有被修改的源文件顶部均带有：

```text
Modified by the RUOK fork on 2026-11-17: ...
```

JSON、Markdown、二进制资源等无法安全插入注释的文件，以本文件作为 AGPL §5a 的修改记录。

### 2.1 应用标识与构建配置

- `package.json`：包名 `opentake-standard` → `ruok`，描述改为 RUOK。
- `desktop/distribution.cjs`：`APP_NAME` → `RUOK`，`APP_ID` → `top.ruok.app`，项目目录 → `RUOK Projects`。
- `desktop/platform.cjs`：用户数据目录 → `%APPDATA%/RUOK`（macOS 对应 Application Support/RUOK）。
- `desktop/policy.cjs`：随 `APP_NAME` 生效。
- `desktop/builder.config.cjs`：`appId`、`productName`、macOS `CFBundleDisplayName/CFBundleName`、图标路径。
- `desktop/installer.builder.config.cjs`：安装器 `productName`、`executableName`、`artifactName`、图标。
- `desktop/windows-version.json`：`repository` → `ruok-app/ruok`，保留 `upstreamRepository` / `upstreamCommit`。
- `desktop/release-contract.cjs`：`REPOSITORY` → 占位 `ruok-app/ruok`。
- `index.html`、`src/workspace/WorkspaceNavigation.tsx`：页面/窗口标题 → RUOK。

### 2.2 品牌与视觉资产

- 品牌母版：`desktop/brand/ruok-master.png`（1254×1254，RGBA 透明底）。素材由用户于 2026-11-17 提供（RUOK-2）：砂岩/赭石浮雕问号，表面刻有赭红岩画纹样（太阳放射纹、弧形河道、圆点螺旋）。原图自带 alpha 通道，未做二次抠图。该素材的商标/版权归属由提供方确认；随仓库或安装包分发前请确认授权范围。
- 生成脚本：`scripts/generate-ruok-icons.mjs`，按需重跑即可更新全部尺寸。新母版去掉了旧素材专用的"极端红/黄像素回填青铜色"补丁，以免破坏赭红岩画纹样；超过母版边长的尺寸不再放大插值，直接沿用母版像素。
- Windows 图标：`public/ruok.ico`，含 16/24/32/48/64/128/256 七个尺寸；小尺寸直接由母版降采样并轻量锐化（16–32px σ0.8 / 64px σ0.6），未使用放大插值。
- macOS 图标：`public/ruok.icns`，含 icp4/icp5/icp6/ic07/ic08/ic09/ic10 及 @2x 变体；`desktop/build-app.mjs` 会复制到 `release/RUOK.icns`，`builder.config.cjs` 直接引用 `public/ruok.icns`。
- 界面 PNG：`public/ruok-icon-{16,24,32,48,64,128,256,512,1024}.png`；`public/ruok-mark.svg` 内嵌 256px PNG，供顶栏使用。
- 安装器素材：`desktop/installer-assets/sidebar.bmp` 由同一母版重出（104px 图标 + 铜绿底 + 青铜字），与新图标的赭石主体保持同一暖色系。
- 关于页：`src/settings/edition.tsx` 增加 64px 品牌图标；窗口、托盘、关于面板继续引用 `ruok-icon-512.png`。
- 色彩关系：新母版主体为赭金（约 `#c98a45`），纹样为赭红（约 `#b1502f`）。UI 三色体系即由此而来：底色（深青墨 / 暖纸白）、文字（深色＝金字 / 浅色＝深墨）、强调（赭金 / 赭红），不再使用铜绿作为界面色；图标作为位图资产不参与主题换色。深色套的正文使用柔金 `#edd6a8`、次要文字 `#bb9a63`，方框与按钮改为带光感的金色描边，浅色套不跟随。
- 旧 T 素材清理：删除 `public/home/*-loop.mp4`、`*-poster.jpg` 共 22 个上游入口/模块动图，`WorkspaceHome` 改为品牌图标占位；`public/home/studio-faders.*` 重制为新品牌背景；删除 `public/opentake-*` 与 `public/brand/icon-*`。
- 旧品牌字形：移除 `workspace-brand-t` 内联 SVG 规则；全仓库搜索 `opentake` 仅剩来源说明、内部标识和兼容变量。
- 编辑器空态标识：`vendor/openscreen/src/components/ai-edition/EditorEmptyState.tsx` 原先直接引用上游 `public/openscreen/openscreen.png`（绿色快门圆形、黑色圆角底），空态 64×64、错误弹窗 36×36；现改为同目录的 `ruok-mark.svg`（与顶栏同一问号资产，由 `public/ruok-mark.svg` 复制），并删除上游图片，尺寸、布局与文案未改。`vendor/openscreen/electron/main.ts` 的默认托盘图标同步换成 `ruok-tray.png`（由 `public/ruok-icon-24.png` 复制），不再引用已删除的文件。
- 顶栏标识：`vendor/openscreen/src/components/ai-edition/v4/EditorTopBar.tsx` 删除对 `@/assets/openscreen-mark.png` 的 import 与装饰性 `img`（该图在 RUOK 下由 `isLinkReaderHost` 隐藏、从不渲染），源图 `vendor/openscreen/src/assets/openscreen-mark.png` 一并移除；重建后产物中既无该图片资源，也无任何引用。

### 2.2.1 主题配色

- `src/workspace/ruok-theme.css` 只保留三族令牌（底色 / 文字 / 强调），组件一律经 `--rk-*` 语义层取色：
  - 底色：`--ruok-patina-900/800/700/600/500`（深）与 `#f7f2e9 → #fffdf8`（浅纸）
  - 文字：`--ruok-ink`、`--ruok-ink-2`、`--ruok-muted`、`--ruok-faint`
  - 强调：`--ruok-accent`、`--ruok-accent-hi`、`--ruok-accent-deep`、`--ruok-accent-ink`
  - 轮廓/结构：原铜绿变量名保留给旧表引用，但值已改为中性石色，不再出现青色。
- 深色（原色）：赭金 `#d8a05e` 作为唯一强调，实心主按钮统一走 `--rk-solid-top/bottom`；浅色（暖雾）：赭红 `#a9552f`，与母版纹样同源。两套主题只在主题层换值，组件不写两套。
- 深色页面的体积光与背景问号受光保留：光束仍由 `.home > .login-backdrop-video::after/::before` 提供，仅把雾化层里的青色换成暖白，并把背景影片源调成同一暖色，避免画面出现第四种色相。
- 时间线、轨道、选中态、播放头、按钮、聚焦环、更新提醒均通过主题变量取色；布局结构未改。

### 2.3 界面与桌面文案

- `src/settings/edition.tsx`：关于页改为 RUOK，显示自研版本号并附上游基线；基线常量在 `src/settings/ruok-version.ts`。
- `src/pages/WorkspaceHome.tsx`、`src/pages/RecordingSetup.tsx`、`src/pages/OpenScreenWorkspace.tsx`、`src/settings/JianyingSettings.tsx`、`src/screen-motion/ScreenSetupGuide.tsx`、`src/studio/components/ConnectionSettings.tsx`、`src/workspace/QuickEdit.tsx`。
- `desktop/menu.cjs`、`desktop/recording-controls.cjs`、`desktop/recording.html`、`desktop/recording-ui.js`、`desktop/creation-tools.cjs`、`desktop/installer.nsh`。

### 2.4 上游更新与服务端通道

- `upgrade.json`：`endpoint` 置空，`mode=beta`，说明本分支未配置更新服务。
- `server/standard/upgrade.ts`：
  - 删除 `register.badesign.top:8433` 与作者 GitHub raw 兜底；
  - 删除 Pro 申请、登录、意向、退出、下载接口；
  - 仅保留本地客户端更新与偏好设置接口；
  - 空 endpoint 时直接返回 offline，不发起网络请求。
- `desktop/mac-update-manifest.cjs`、`desktop/windows-update-manifest.cjs`：`product` → `ruok`，安装包名 → `RUOK-*`，endpoint 跟随 `REPOSITORY`。
- `desktop/build-app.mjs`、`desktop/client-update.cjs`：移除“必须官方作者仓库”校验，回执 repository 改为本分支常量。
- `src/standard/ClientUpdate.tsx`、`src/standard/WindowsUpdate.tsx`、`src/standard/update-shared.tsx`：移除作者 Releases 链接与“官方安装包”措辞。

### 2.5 Pro 入口与文案

- 删除：`src/standard/Upgrade.tsx`、`src/standard/ProStyleDialog.tsx`、`src/standard/modules.ts`。
- `src/App.tsx`：移除 `UpgradeDialog` 与 `/pro/:id` 路由。
- `src/workspace/style-library/StyleLibrary.tsx`、`style-library.ts`：移除 ProStyleDialog，不可用风格显示“未包含”。
- `src/general/GeneralEntrance.tsx`、`src/general/entrance-edition.tsx`：移除 `EntranceUpgrade`，不可用风格改为“本分支未包含”。
- `src/desktop/DesktopSession.tsx`：移除 `UpgradeButton`。
- `src/workspace/modules.ts`：删除 Pro 工作模块，空分组过滤。
- `src/workspace/WorkspaceHome.tsx`、`src/workspace/QuickEdit.tsx`：移除“升级到 Pro”和 `/pro/koubo`。

### 2.6 安装包、更新器与通知

- `desktop/installer.nsh`：安装向导与 `installation-result.txt` 改为 RUOK。
- `desktop/build-installer.mjs`、`desktop/build-mac-installer.mjs`：产物名与卷名改为 RUOK。
- `desktop/update-engine.cjs`、`desktop/update-worker.cjs`、`desktop/sign-local-app.cjs`：只接受 `RUOK.app` / `RUOK-*`。
- `desktop/install-payload.cjs`：关键文件 `RUOK.exe`。
- `desktop/sandbox-read-access.py`：包名校验 `ruok`。
- `desktop/prepare-runtimes.mjs`：构建标记文件名改为 `RUOK-*`。

### 2.7 许可与署名

- `LICENSE`：保留 AGPL-3.0 原文，未修改。
- `NOTICE`、`NOTICE.base`：顶部新增 RUOK 分支说明；以下上游版权、lemo-opuscar (MIT)、LemoLab 预览素材 (CC BY 4.0)、OpenScreen (MIT)、FFmpeg、HyperFrames、Electron 等署名全部保留。
- `TRADEMARK.md`：新增 RUOK 分支商标边界说明。
- `THIRD-PARTY-LICENSES.json`、`licenses/npm/**`：保留；发布新安装包前需重新生成并复核。
- `vendor/adu/`：新增第三方 vendor（adu-motion-video，MIT），作为可调用的 HTML 逐帧渲染后端；来源、提交与本地修改见第 6 节。
- `README.md`：顶部改为 RUOK 构建说明，移除作者下载/统计链接；其余上游技术文档保留并加注适用性说明。

### 2.8 2.1.0 模块闭环

- 新增 `src/workspace/handoff.ts`：选题 → 文案发布 → 运营分析的一次性交接，保存发布平台清单与草稿校验。
- `src/topics/TopicsPage.tsx`：卡片与选题篮新增「去写稿」，写入标题、钩子、大纲、平台与角度。
- `src/publish/PublishPage.tsx`：读取交接草稿并显示来源，平台常量迁入 `handoff.ts`，结果区新增「记入运营分析」。
- `src/analytics/AnalyticsPage.tsx`：读取交接草稿，预填标题、平台、钩子与题材并显示来源。
- `src/topics/topics.css`、`src/publish/publish.css`、`src/analytics/analytics.css`：新增交接提示与写稿入口样式，沿用三套主题令牌。
- `server/handoff.test.ts`：交接纯函数的回归测试。
- `RELEASE-NOTES-2.1.0.md`：本版发布说明。

## 3. 验证记录

| 步骤 | 结果 | 说明 |
|---|---|---|
| `npm ci` | 通过 | 588 packages；部分 install scripts 未批准，但 `node_modules/electron/dist/electron.exe` 已存在 |
| `npm --prefix vendor/openscreen ci` | 通过 | 安装 OpenScreen 前端依赖 |
| `npm run typecheck` | 通过 | `tsc -p tsconfig.json` 无输出 |
| `node scripts/build-desktop-ui.mjs` | 通过 | Vite 产出 `dist/`，含部分 chunk 体积/browserslist 警告 |
| `npm run build:native` | 失败 | `Error: 未找到带 MSVC x64 和 Windows SDK 的 Visual Studio C++ 工具链。` |
| `npm start` | 通过 | Electron 启动，主窗口标题为 `RUOK`；已截图核对顶栏问号图标、首页卡片与青铜/铜绿配色 |
| `public/ruok.ico` | 通过 | 解析到 16/24/32/48/64/128/256 共 7 个条目 |
| `public/ruok.icns` | 通过 | magic/length 校验通过，含 icp4/icp5/icp6/ic07-ic10 及 @2x |
| `npm test` | 未执行 | 见第 5 节，旧断言预计失败，不能声称通过 |

### 缺失依赖与补充方式

- Visual Studio C++ 生成工具（含 MSVC x64 与 Windows SDK）：安装 Visual Studio Build Tools，勾选“使用 C++ 的桌面开发”。
- Python 3 + FFmpeg + Chromium Headless Shell：完整安装包/出片流程需要，按 `WINDOWS-RUNTIME-NOTICES.md` 与 `resources/runtimes/manifest.json` 准备。
- macOS 构建：需要 macOS、Xcode Command Line Tools、`iconutil`、`hdiutil`；当前环境无法验证。

## 4. 已知遗留待办

1. ~~`public/opentake-*`、`public/brand/icon-*` 随包分发~~：已从工作树删除（Git 历史保留）。发布前仍需确认构建产物中无官方品牌图。
2. ~~占位图标替换~~：已完成。正式图标源 `desktop/brand/ruok-master.png`，输出 `public/ruok.ico`、`public/ruok.icns`、`public/ruok-icon-*.png`、`public/ruok-mark.svg`；重跑 `node scripts/generate-ruok-icons.mjs` 即可再生成。
3. ~~安装器侧边图~~：`desktop/installer-assets/sidebar.bmp` 已按新图标和配色重绘。
4. ~~首页旧 T 动图~~：已删除 22 个上游 `public/home/*-loop.mp4`/`*-poster.jpg`，首页改为问号图标占位；`studio-faders.*` 已重制。
5. 重新打包后需要重新生成并复核 `THIRD-PARTY-LICENSES.json`、`NOTICE`、`licenses/npm/**` 与安装包内 notices；图标本身已不依赖旧素材，但 notices 需随新包更新。
6. `package-lock.json` 顶层 name 已同步为 `ruok`；发布前仍需跑一次安装包签名/公证。
7. 测试与快照仍按旧名称断言：`desktop/policy.test.cjs`、`distribution.test.cjs`、`mac-update-manifest.test.cjs`、`update-engine.test.cjs`、`client-update.test.cjs`、`sign-local-app.test.cjs`、`sandbox-read-access.test.ps1`、`server/standard-upgrade.test.ts`、`standard-pro-notice-ui.test.ts`、`standard-update-http.test.ts`、`standard-windows-update*.test.ts`、`standard-client-update.test.ts`。
8. `.github/workflows/*.yml` 与 `scripts/prepare-*-release.mjs` / `publish-*.mjs` 仍指向作者仓库与旧产物名；发布前必须改写。
9. 自动更新源为空：需要自建 `upgrade.json` endpoint、签名、回执校验与发布流程后再启用。
10. 上游 Pro 模块只删除了入口，没有等价自研实现；需要时按模块补齐。
11. 内部 `opentake-*` 事件名、storage key、`OPENTAKE_*` 环境变量保留以降低兼容风险，未做全量重命名。
12. 官方截图 `screenshots/*.png` 仍是上游界面，需重新截图或标注为上游示意。
13. 上游文档 `AGENTS.md`、`WINDOWS-RELEASE.md`、`WINDOWS-INSTALLER.md`、`RELEASE-NOTES-*.md`、`DOWNLOAD-STATS.md`、`BUILD-MACOS.md` 仍保留旧名/作者下载说明，发布前需改写或标注为上游资料。

## 5. 许可与商标声明

RUOK 是 OpenTake Standard 的修改版本，按 AGPL-3.0-only 分发。原始代码版权归 OpenTake 贡献者；RUOK 的修改部分同样按 AGPL-3.0-only 提供。OpenTake 名称与 T 图标不包含在代码许可中；RUOK 不使用其作为产品标识，也不声称获得原作者背书。第三方组件继续遵循各自许可，完整署名见 `NOTICE`、`THIRD-PARTY-LICENSES.json` 和 `licenses/`。

## 6. Vendored 第三方代码：adu-motion-video

- 上游仓库：https://github.com/adunext/adu-motion-video
- 上游版本：`3.14.2-rc.1`
- 上游提交：`4ae737a04107083288c02eab5c0861834fcc0364`（2026-11-14，3.14.2-rc.1：通过 DevTools 协议把导出帧做成快速无损 PNG）
- 许可：MIT（见 `vendor/adu/LICENSE`，1088 字节，原文未改）
- 本地目录：`vendor/adu/`
- 接入日期：2026-11-21
- 用途：HTML → Chrome 逐帧 → FFmpeg 的动效模板渲染后端，由 `server/general/adu-runtime.ts` 暴露 `renderAduProject()` 调用；暂未接 UI，仅作为可调用后端。
- 拷贝范围：保留 `scripts/`、`template/`、`packs/`、`assets/fonts/`，以及 `references/`、`adapters/`、`adaptation-profiles/`、`agents/`、`third-party/` 等支撑目录和顶层 `LICENSE`/`package.json` 等文件；排除 `node_modules/`、`.git/`、`assets/demos/`、`assets/tutorials/`、`docs/`、`examples/`、`tests/`、`cover.png` 等非必需内容（vendored 副本约 33.4 MB）。adu 的裸依赖 `acorn`、`playwright-core` 由 `ruok/node_modules` 沿目录树向上解析，无需在 vendor 内单独安装。
- 复用 RUOK 运行时：`aduEnv()` 把 `CHROME`/`ADU_PLAYWRIGHT_MODULE`/`ADU_PYTHON` 指向 RUOK 解析到的工具，并把 RUOK 自带 ffmpeg 所在目录前置到 `PATH`，使 adu 的裸 `ffmpeg`/`ffprobe` 命中同一二进制。
- 打包分发：`desktop/builder.config.cjs` 在排除 `vendor/**` 之后重新包含 `vendor/adu/**`（`vendor/openscreen` 仍不进包，其产物已在 `dist/`）。已用 `npx electron-builder --win dir` 验证产物 `resources/app/vendor/adu` 含 885 个文件、33.4 MB，并从该产物目录实际渲染出片。
- 换行符与冻结包：adu 的 pack/template 清单按文件字节 SHA-256 校验。Windows 上 `core.autocrlf=true` 会把握手文件检出成 CRLF，导致 `macro-build` 报 `Frozen pack file changed or missing`。`.gitattributes` 已为 `vendor/adu/**` 设置 `-text`，保持上游原始字节；改动 vendor 后不要重新规范化这些文件。

### 6.1 本地修改（同步上游时需复核，详见 `vendor/adu/RUOK-PATCHES.md`）

1. `scripts/color_management.py`：FFmpeg 主版本闸由 `>= 9` 放宽到 `>= 8`（SDR 导出路径）；版本正则放宽为容忍 `n` 等非数字前缀（RUOK 自带构建报告 `ffmpeg version n8.1.3`）。HDR 输入导入仍需 FFmpeg 9+，RUOK 不使用。
2. `scripts/render_project.mjs`：H.264 编码器由硬编码 `libx264` 改为运行时探测——`libx264` 优先，缺失时回退 `libopenh264`（高码率），并支持 `ADU_VIDEO_ENCODER`/`ADU_VIDEO_ENCODER_OPTS` 覆盖。原因：RUOK 自带的是 LGPL FFmpeg，不含 GPL 的 libx264。
3. 运行时约定：每个 adu 工程目录写无 BOM 的 `output-signature.json`（`enabled:false`）关闭右上角角标；`server/general/adu-runtime.ts` 的 `disableSignature()` 统一写入。关闭官方角标后，`scripts/render_project.mjs` 另行调用 `disableSourceClocks()` 隐藏模板自带的右上角源 HUD 时码（保留品牌文本），该逻辑上游原本只随官方角标启用。

### 6.2 已知边界

- 仅支持 SDR 导出（Chrome sRGB 帧 → BT.709）；HDR 输入不支持。
- 编码器回退到 `libopenh264` 时质量略低于上游 `libx264 -crf 15`，码率固定 16 Mbps；如需更高质量可设置 `ADU_VIDEO_ENCODER=libx264`（需自带含 libx264 的 FFmpeg）。
- `vendor/adu/template` 是骨架工程，直接渲染需经 `--optional-data` 放过缺失的可选场景模块（`talkmap.js`/`face.js`/`subs.js`/`wall.js`，由 `pipeline.py build` 生成）；完整工程应由 `pipeline.py build` 从 packs 构建。
