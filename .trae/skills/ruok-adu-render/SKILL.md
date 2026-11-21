---
name: ruok-adu-render
description: 在 RUOK 中调用和维护 adu-motion-video 渲染后端。用于 adu 出片、关闭右上角角标、处理 FFmpeg 8.x 与 H.264 编码器兼容、同步 vendor 补丁及渲染回归；不用于替代上游模板选型与完整创作流程。
---

# RUOK adu 渲染

在 RUOK 仓库根目录工作。本技能只管理已接入的渲染后端及其兼容性，不另建一套渲染入口。

## 先读现状

开始修改前，按任务读取：

- `server/general/adu-runtime.ts`：RUOK 唯一 adu 接线层。
- `server/adu-render.test.ts`：角标、运行时和端到端渲染回归。
- `vendor/adu/RUOK-PATCHES.md`：本地补丁、上游基线与同步注意事项。
- 涉及完整 pack 创作、模板选择或素材适配时，另读 `vendor/adu/SKILL.md`、`vendor/adu/AGENTS.md` 和 `vendor/adu/references/rules.md`，遵循上游流程。

`vendor/adu/template` 只是骨架工程，不代表完整 pack 的制作和声画验收。不要用空数据文件掩盖正式工程的真实缺素材错误。

## 使用既有后端

服务端渲染调用 `server/general/adu-runtime.ts` 中的 `renderAduProject(projectDir, outMp4, options)`，不要绕过它直接拼 adu 子进程命令。

- 工程目录必须含 `index.html`；输出目录由接线层创建，已有同名 MP4 会被替换，因此调用前确认输出路径是本次新产物。
- 用 `start`、`end`、`fps`、`width`、`height`、`audio` 和 `onProgress` 传递渲染参数。
- 直接渲染骨架 template 时沿用默认 `TEMPLATE_OPTIONAL_MODULES`。正式工程应明确判断 `optionalData`，需要缺失资源立即失败时传 `[]`。
- 默认关闭 adu 角标。只有用户明确要求保留时才传 `keepSignature: true`。
- 调用方处理运行时未就绪的异常；自动化测试可显式跳过，真实出片不能把跳过或异常当作成功。

## 保持运行时统一

通过 `aduEnv()` 复用 RUOK 的运行时，不在 `vendor/adu` 内另装依赖，不引入第二套 FFmpeg：

- `CHROME` 来自 `chromePath()`。
- `ADU_PLAYWRIGHT_MODULE` 指向 RUOK `node_modules/playwright-core`。
- `ADU_PYTHON` 来自 `pythonPath()`。
- RUOK 的 FFmpeg 目录置于 `PATH` 最前，保证裸 `ffmpeg` 和 `ffprobe` 命中同一运行时。
- `ELECTRON_RUN_AS_NODE=1` 和 Windows Node 选择由 `renderAduProject()` 处理。

本机验证可临时设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向已确认的 Chrome。不要把本机浏览器绝对路径写进仓库，也不要让生产代码静默搜索其他浏览器。

## 角标规则

使用 `disableSignature()` 或 `renderAduProject()` 的默认行为，在工程目录写入无 BOM 的 `output-signature.json`：

```json
{"schema":"adu-output-signature/1","enabled":false}
```

不要用可能附带 BOM 的 shell 重定向生成该文件。不要修改冻结 pack、叠加第二套时码或 Logo，也不要把源片时间塞入角标。渲染报告中的 `signature.enabled=false` 只证明配置生效；修改角标实现后还须抽取实际帧检查右上角画面。

## FFmpeg 与编码器边界

RUOK 当前使用版本串含 `n` 前缀的 FFmpeg 8.1.3 LGPL 构建。维护或同步上游时保留以下兼容逻辑：

- `vendor/adu/scripts/color_management.py` 的版本正则容忍非数字前缀，SDR 主版本阈值为 8。
- 保留 `scale` 的 `in_transfer`、`out_primaries` 和 `perceptual tone mapping` 能力检查，不能只改版本号后宣称所有构建均可用。
- 当前放行范围是 Chrome sRGB 到 BT.709 的 SDR 链路。HDR 导入仍需 FFmpeg 9+ 和单独验收，不得只改色彩标签冒充 HDR 支持，也不要为当前 SDR 路径另捆绑 FFmpeg 9。
- `vendor/adu/scripts/render_project.mjs` 自动优先选择 `libx264`，不可用时回退 `libopenh264 -b:v 16M -maxrate 16M`。RUOK 的 LGPL 构建没有 `libx264`，不要恢复硬编码。
- 仅在明确需要时用 `ADU_VIDEO_ENCODER` 和 `ADU_VIDEO_ENCODER_OPTS` 覆盖编码器，并在结果中记录实际选择。

## 同步 vendor 时

1. 先核对 `vendor/adu/RUOK-PATCHES.md` 中的上游提交和三处集成约定，逐项判断补丁仍需保留还是已被上游吸收。
2. 保留 MIT 许可和字体许可，复核字体哈希；不要带入 `.git`、`node_modules`、缓存或探针产物。
3. 按实际复制范围更新 `RUOK-PROVENANCE.md` 和 `THIRD-PARTY-LICENSES.json`，排除目录说明必须与实际文件一致。
4. 将后续本地修改追加到 `vendor/adu/RUOK-PATCHES.md`，不要静默覆盖上游差异。

## 验证

源码修改后运行：

```powershell
npm.cmd run typecheck
node --experimental-strip-types --test server/adu-render.test.ts
```

改动共享运行时或通用渲染逻辑时，再运行：

```powershell
node --experimental-strip-types --test server/general-hf-sounds.test.ts
```

本机有已确认 Chrome 时，可在当前 PowerShell 进程临时设置后重跑端到端测试：

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE='实际 Chrome 可执行文件绝对路径'
node --experimental-strip-types --test server/adu-render.test.ts
```

完整端到端验收要求 adu 测试 4 项全部通过且没有跳过。若浏览器或运行时缺失导致跳过，必须明确报告“仅完成静态或无浏览器回归”，不能宣称出片通过。

成功的 2 秒、30fps 冒烟结果应有非空 MP4、H.264 视频流、至少 59 帧，报告含 `signature.enabled=false`。改编码器或色彩链路时，另用 RUOK 的 `ffprobe` 核对 SDR 输出为 yuv420p、BT.709、TV range，并检查实际画面。

源码测试不覆盖完整 `pipeline.py build` pack 工程，也不证明打包后资源路径有效。涉及这些范围时分别执行真实 pack 连续声画验收和 `win-unpacked` 或安装包验收；未执行前保留为明确限制。

## 汇报

说明实际输出路径、渲染参数、编码器、角标状态、测试通过与跳过数量，以及未覆盖的 pack 或安装包边界。不要仅因命令退出码为 0 就扩大验收结论；不要主动提交或推送代码。
