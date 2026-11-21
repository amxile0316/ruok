# adu-motion-video 接入 RUOK：vendor + 角标关闭 + FFmpeg SDR 放行 — 实现计划

## 仓库调研结论

- **现有出片后端**在 `server/general/`：`runtime-tools.ts` / `kit-env.ts` 统一解析 `ffmpegPath()`、`chromePath()`、`pythonPath()`、`nodeModulesPath()`；`prepareWork()` 把这些写进 `.opentake/bin` 包装器和 `CW_*` 环境变量。adu 复用这套解析即可，无需另起一套运行时管理。
- **adu 渲染器 `scripts/render_project.mjs`** 的三个外部依赖都可由环境变量/路径注入：
  - 浏览器可执行文件 → 读 `CHROME` 环境变量（`chrome.mjs`）；
  - playwright-core → 读 `ADU_PLAYWRIGHT_MODULE` 环境变量；
  - ffmpeg/ffprobe → 用裸名从 `PATH` 解析。
- **角标**：由每个工程目录下 `output-signature.json` 的 `enabled` 字段控制，`false` 即完全不绘制右上角时间码 + Circle Logo；`verify_delivery.py` 不校验角标存在（无硬依赖）。已实测 `enabled:false` 后 18s 帧右上角干净。注意：工程 JSON 必须无 BOM（PowerShell 5 默认带 BOM，写入要用无 BOM UTF-8）。
- **adu 脚本裸依赖只有 `acorn` 和 `playwright-core`**，两者在 `ruok/node_modules` 都存在（playwright-core 是直接依赖 1.63.0；acorn 由 @babel 提升到根 node_modules）。vendored 后 Node 沿目录树向上解析到 `ruok/node_modules`，**无需单独 `npm install`**。
- **adu 仓库体量**（探针副本，排除 `node_modules`/`.git`）：约 69 MB。其中渲染非必需、可剔除的有：`--help/`（探针里的未跟踪垃圾，非上游内容）、`assets/demos/`、`assets/tutorials/`、`assets/cover.png`、`docs/`、`examples/`、`tests/`、`third-party/`。渲染必需 = `scripts/` + `template/` + `packs/` + `assets/fonts/`，约 33 MB。packs 内部无对 `packs/` 之外路径的相对引用（已 grep 确认），但 packs 经 `template/` 作为基底、经 `assets/fonts/` 装字体，故三者都要保留。
- **FFmpeg 版本闸**：`scripts/color_management.py` 的 `engine()` 硬卡主版本 `< 9`。RUOK 全栈自带 ffmpeg 8.1.3（`runtime-payload`），已实测 8.1 具备它用到的全部 scale 色彩选项、SDR 输出标签（bt709/tv）正确无偏色。采用方案 A：对该文件打一行 SDR 放行补丁（主版本 ≥8 且选项齐全即放行），渲染时把 adu 的 PATH 指向 RUOK 自带 ffmpeg。
- **vendor 惯例**：仓库已有 `vendor/openscreen`、`vendor/openscreen-compositor`、`vendor/openscreen-wgc`，`vendor/` 未被 gitignore。新增 `vendor/adu` 遵循同一惯例。
- **测试约定**：`server/*.test.ts`，用 `node --experimental-strip-types --test <file>`；无浏览器时应跳过（try/catch 包住 `chromePath()`）。

## 文件与模块

- `vendor/adu/`（新增）：从探针副本拷贝上游 adu，剔除非必需目录（见下）。记录上游来源 commit 与 MIT 许可。
- `vendor/adu/scripts/color_management.py`（修改）：主版本阈值 `9 → 8`，加 RUOK 补丁注释（SDR 放行；HDR 仍需 9）。
- `server/general/adu-runtime.ts`（新增）：接线层，导出：
  - `aduRoot()` — 解析 `vendor/adu` 绝对路径；
  - `aduEnv(base)` — 组装 adu 子进程环境：`CHROME=chromePath()`、`ADU_PLAYWRIGHT_MODULE=<nodeModulesPath>/playwright-core`、`PATH` 前置 `dirname(ffmpegPath())`；
  - `disableSignature(projectDir)` — 向工程目录写无 BOM 的 `{"schema":"adu-output-signature/1","enabled":false}`；
  - `renderAduProject(projectDir, outMp4, opts)` — 调 `render_project.mjs`（或 `pipeline.py render`），返回产物路径与诊断。
- `server/adu-render.test.ts`（新增）：无浏览器跳过；否则用 `vendor/adu/template` 搭临时工程、关闭角标、渲染 2s/30fps，断言产物存在且（mp4）含视频流、无角标签名报告。
- `THIRD-PARTY-LICENSES.json` + `RUOK-PROVENANCE.md`（更新）：登记 adu 的 MIT 许可、来源仓库与 commit、vendor 路径。
- `vendor/adu/.gitignore` 可能需要忽略 `__pycache__/`（Python 运行产物），避免污染工作区。

## 实现步骤（依赖顺序）

1. **拷贝 vendor**：从 `f:\RUOK\_probe\adu-motion-video` 拷贝到 `vendor/adu`，排除 `node_modules/`、`.git/`、`--help/`、`assets/demos/`、`assets/tutorials/`、`assets/cover.png`、`docs/`、`examples/`、`tests/`、`third-party/`。验证字体哈希与 `assets/fonts/sources.json` 一致（探针里已转 LF，拷贝后复核）。
2. **打 FFmpeg 补丁**：改 `vendor/adu/scripts/color_management.py` 的版本闸（9→8，带注释）。
3. **写接线层**：新增 `server/general/adu-runtime.ts`，复用 `kit-env.ts` 的 `ffmpegPath/chromePath/nodeModulesPath/pythonPath`；实现 `aduEnv` / `disableSignature` / `renderAduProject`。`PATH` 前置用 `platform.environmentWithPath`（与 `prepareWork` 一致）。
4. **冒烟验证（探针阶段）**：在实现代码前，先用命令行模拟 `aduEnv` 的环境变量跑一次 `vendor/adu/template` 的 2s 渲染，确认 vendored 副本 + RUOK ffmpeg + RUOK playwright-core + 本机 Chrome 能出片、角标关闭生效。这一步在落地代码前先证路径通。
5. **写测试**：`server/adu-render.test.ts`，无浏览器跳过，有则端到端渲染并断言。跑 `node --experimental-strip-types --test server/adu-render.test.ts` 通过。
6. **登记许可**：更新 `THIRD-PARTY-LICENSES.json` / `RUOK-PROVENANCE.md`，加 adu 条目。
7. **防污染**：在 `vendor/adu` 下加 `.gitignore` 忽略 `__pycache__/`、`*.pyc`。
8. **回归**：跑现有相关测试（`server/shot-recipes.test.ts` 等）不破坏；确认 `git status` 干净（无 `modified` 残留），为下次打包凭据干净做准备。

## 依赖与注意事项

- adu 的 `pipeline.py` 启动时会校验打包字体哈希（`assets/fonts`），拷贝后必须复核 4 个文件哈希与 `sources.json` 一致，否则任何 `pipeline.py` 命令都会失败。
- `output-signature.json` 必须无 BOM，否则 `JSON.parse` 抛 `Unexpected token '﻿'`。统一用无 BOM UTF-8 写入。
- 浏览器：用 `chromePath()` 解析（优先 `CW_CHROME`/`PLAYWRIGHT_CHROMIUM_EXECUTABLE`，其次 Playwright 捆绑 chromium，再回退 headless shell）。若都没有，`chromePath()` 抛错 → 接线层与测试都应把它转化为"环境未就绪"的明确错误/跳过，而不是崩溃。
- ffmpeg 8.1.3 放行只覆盖 SDR（RUOK 全链路是 SDR：Chrome sRGB 帧 → BT.709）。HDR 输入导入仍不支持，这是已知边界，需在接线层注释和文档里写明。
- 打包：`vendor/adu` 约 33 MB 会进安装包。需确认 electron-builder 的 `extraResources`/asar 配置是否会把 `vendor/` 打进产物且运行时路径可解析（`aduRoot()` 用 `fileURLToPath(new URL('../../vendor/adu', import.meta.url))` 一类方式）。若打包后路径解析失败，验证阶段补 `desktop` 配置。
- 本次不做 UI 接线（剪辑台按钮/动效库入口），只把 adu 变成 RUOK 内**可调用的渲染后端**并验证端到端出片。UI 挂接留作下一步。

## 验证

- 命令行冒烟：模拟 `aduEnv` 环境，渲染 `vendor/adu/template` 2s/30fps → 生成 mp4，`ffprobe` 确认 h264/yuv420p/bt709/tv，抽帧确认右上角无角标。
- 测试：`node --experimental-strip-types --test server/adu-render.test.ts` 通过。
- 回归：`node --experimental-strip-types --test server/shot-recipes.test.ts`（本次改动不涉及它，但确认工作区无连带破坏）。
- 字体哈希：`vendor/adu/assets/fonts` 4 个文件 SHA-256 与 `sources.json` 一致。
- 工作区干净：`git status --short` 无未跟踪的 `__pycache__`/运行产物残留。

## 风险

- **打包后路径解析失败**：`aduRoot()` 在开发态（仓库内）与打包态（asar / resources）路径形态不同。处理：先用 `import.meta.url` 相对定位，验证阶段用 `win-unpacked` 实跑确认；若失败，参照 `desktop/runtime-paths.cjs` 的运行时解析方式补一层。
- **packs 引用遗漏**：拷贝时若误删了 packs 渲染依赖的目录，冒烟测试会失败。处理：冒烟用真实 pack 渲染（不只 template），失败则把缺失目录补进 vendor 清单。
- **FFmpeg 补丁被上游更新覆盖**：未来同步 adu 上游时补丁可能丢失。处理：在 `vendor/adu` 放一个 `RUOK-PATCHES.md` 记录补丁点，同步时复核。
- **CI 无浏览器导致测试红**：处理：测试在 `chromePath()` 抛错时 `skip`，并在 CI 日志里标注为跳过而非失败。
