# RUOK 对 vendor/adu 的本地修改记录

> 同步上游 `adunext/adu-motion-video` 时，请逐项复核下列补丁是否仍需保留或已被上游吸收。
> 上游基线：`4ae737a04107083288c02eab5c0861834fcc0364`（3.14.2-rc.1，2026-11-14）。

## 1. `scripts/color_management.py` — FFmpeg 版本闸与正则

**动机**：RUOK 自带 FFmpeg 8.1.3（LGPL 构建，版本串形如 `ffmpeg version n8.1.3-...`）。上游硬卡主版本 `>= 9`，且版本正则要求空格后紧跟数字，导致 8.x 的 `n` 前缀构建直接判失败。RUOK 全链路是 SDR（Chrome sRGB → BT.709），8.1 已具备所需的全部 scale 色彩选项。

**改动**：
- `engine()` 中版本正则：`r'ffmpeg version (\d+)'` → `r'ffmpeg version \D*(\d+)'`，容忍 `n` 等非数字前缀。
- 版本闸：`int(match[1]) < 9` → `int(match[1]) < 8`，并保留选项齐全性检查（`in_transfer`/`out_primaries`/`perceptual tone mapping`），缺选项仍会响亮失败。
- 错误信息补充「for HDR import」，明确 HDR 输入仍需 FFmpeg 9+。

**验证**：`python scripts/color_management.py --export-plan` 在 RUOK ffmpeg 8.1.3 下返回 `engine=libswscale-perceptual`，filter 链与色彩标签正确。

## 2. `scripts/render_project.mjs` — H.264 编码器回退

**动机**：上游硬编码 `-c:v libx264 -preset medium -crf 15`。RUOK 自带的是 **LGPL** FFmpeg（`runtime-payload/ffmpeg`），不含 GPL 的 libx264，导致 `Unknown encoder 'libx264'`、ffmpeg 在第一帧后退出。

**改动**：
- 新增模块级 `videoEncoderArgs()`：运行时执行 `ffmpeg -hide_banner -encoders`，优先选 `libx264`（保留原 `-preset medium -crf 15`），否则回退 `libopenh264 -b:v 16M -maxrate 16M`（LGPL 构建中常驻）。结果缓存。
- 支持环境变量覆盖：`ADU_VIDEO_ENCODER` / `ADU_VIDEO_ENCODER_OPTS`。
- 原 args 行的 `-c:v libx264 -preset medium -crf 15` 替换为 `...videoEncoderArgs()`。

**验证**：`libopenh264` 端到端渲染产出 h264/yuv420p/bt709/tv，`ffprobe` 色彩标签正确。

## 3. `scripts/output-signature.mjs` + `scripts/render_project.mjs` — 关闭官方角标时隐藏源 HUD 时码

**动机**：模板自带的右上角 HUD 会渲染 `品牌 + 源时码`（如 `YOUR BRAND 00:00:09:00`）。上游把隐藏这段源时码的逻辑 `hideSourceClocks()` 写在 `createSignature()` 内部，只有官方角标启用时才执行；RUOK 通过 `output-signature.json` 关闭官方角标后，该逻辑完全不运行，角落仍残留模板时码。

**改动**：
- `output-signature.mjs` 新增导出 `disableSourceClocks(page)`：沿用上游同一套筛选条件（右上角、时钟文本格式、字号 ≤ 40），只标记时钟节点并注入 `[data-motiongit-source-clock]{display:none!important}`；保留品牌文本，不移动 HUD 容器，也不绘制任何角标。函数在页面内安装 `window.__aduHideSourceClocks` 并返回本轮标记数量。
- `render_project.mjs`：`output-signature.json` 的 `enabled:false` 分支调用一次 `disableSourceClocks(page)`；此后每次 `renderAt(t)` 后的求值里再次调用已安装的 `__aduHideSourceClocks()`，覆盖生成工程按需重建的 HUD 节点。
- 渲染报告新增 `sourceClocks` 字段（官方角标启用时为 `0`，表示该路径由上游逻辑处理）。

**验证**：`vendor/adu/template` 渲染报告 `sourceClocks >= 1`，1/9/15 秒抽帧右上角只剩品牌文本，无源时码；官方 `mm:ss` 与 Circle Logo 仍不出现。

## 4. 运行时约定（非 vendor 文件修改，由接线层施加）

- `server/general/adu-runtime.ts` 渲染前向工程目录写入无 BOM 的 `output-signature.json`（`{"schema":"adu-output-signature/1","enabled":false}`），关闭 adu 右上角时间码 + Circle Logo。必须无 BOM，否则 adu 的 `JSON.parse` 抛 `Unexpected token '﻿'`。
- `aduEnv()` 注入 `CHROME`/`ADU_PLAYWRIGHT_MODULE`/`ADU_PYTHON` 并把 RUOK ffmpeg 目录前置到 `PATH`。
- `renderAduProject()` 默认只为工程中**确实缺失**的可选模块生成 `--optional-data`（`missingOptionalModules()`）。上游只接受缺失脚本，`pipeline.py` 生成的工程四个可选模块齐全，若按模板默认全量放行会被拒绝渲染（`Optional allow-list is only for missing data scripts`）。

## 不修改的部分

- 未修改任何冻结 pack、未叠加第二套角标、未改源片时间（遵循上游 `AGENTS.md` 统一角标约定；关闭角标走上游支持的 `output-signature.json` 配置）。
- `assets/fonts/` 四个文件字节与 `assets/fonts/sources.json` 的 SHA-256 一致（LF 行尾），未改动。
