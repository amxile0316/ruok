---
name: sync-lemo-styles
description: 把上游 Lemo-Opuscar 的风格批量接入 RUOK 并渲染预览。用于同步/补全风格库、批量生成 text-presets、渲染缺失预览、更新白名单与中文目录；不用于单个风格手动微调或非 Lemo 来源风格。
---

# 同步 Lemo-Opuscar 风格库

把上游 [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) 的风格接入 RUOK 的 `kit/styles`，让更多风格可选可出片，并补齐预览。本技能只处理「Lemo 来源、批量」的同步；单个风格的文字/坐标微调或非 Lemo 风格不在范围内。

在 RUOK 仓库根目录 `f:\RUOK\ruok` 工作。上游原始文件下载到仓库外的 `f:\RUOK\_upstream\`（不入库）。

## 先读现状

开始前读取这些文件，确认当前基线：

- `src/standard/styles.json`：风格白名单数组（决定 UI 是否可选）。
- `src/standard/category-styles.json`：9 个入口（bucket `"0"`–`"8"`）到风格 id 的映射。
- `src/workspace/style-library/style-library.json`：中文目录，含每条的 `preview`/`poster`/`attribution`。
- `server/general/kit/styles/<id>/`：每个已接入风格的目录，含 `STYLE.md`/`DEMO.md`/`text-presets.json`。
- `server/standard.test.ts`：含白名单长度的**硬编码断言**，增删风格必须同步改。
- `server/general/jianying-captions.test.ts`：**动态遍历**计数，不要改硬编码数字。
- `public/styles/<id>.mp4` / `<id>.jpg`：预览视频与封面，缺失则 UI 显示破图占位。

入口过滤逻辑在 `src/general/entrance-edition.ts` 的 `categoryAllowed(index,id)`，显示「本分支未包含」只看白名单，与 `input_type` 无关——所以 material 类风格加白名单后即可正常选。

## 范围确认

1. 上游风格总数：读取 `f:\RUOK\_upstream\styles\` 目录（或上游仓库 `styles/`）。基线为 99 个。
2. 已接入：`src/standard/styles.json` 的 id 数（基线 100 = 上游 99 + RUOK 原创 `product-promo`）。
3. 缺失 = 上游有但白名单没有。对每个缺失风格，读其 `STYLE.md` 判断是否需外部素材/数据输入——若 `scan`/`data` 只是视觉效果词则是误报，照常接入；若真依赖素材，其 `STYLE.md` 会给公开 fallback 来源，按上游 DIRECTOR 规定可自行获取。
4. README 标 ✦ 的风格（`text-flash-cuts`/`comic-history`/`manga-panels`，需图像生成器）也纳入，在各自 `STYLE.md` 顶部加一行标注：`<!-- ⚠ 出片前置 / requires image generator: ... -->`。

## 流程 A：批量接入新风格

对每个缺失风格，在 `server/general/kit/styles/<id>/` 写入三个文件：

- `STYLE.md`：上游原文 + 顶部来源注释头（标明上游 commit 与许可）。
- `DEMO.md`：上游原文 + 来源注释头 + OpenTake 说明段。
- `text-presets.json`：自写生成，规则见 [references/font-pool.md](references/font-pool.md)。从 STYLE.md 配色 + 字体池自动生成 3 个预设（标题/字幕/标签），`finishes:["none"]`。**只能从有 fontFile 的 15 对字体里挑**，避开 fontFile 为空的 2 对，否则剪映测试 `fontFile` 断言失败。

然后同步四处配置：

1. `src/standard/styles.json`：白名单加入新 id。
2. `src/standard/category-styles.json`：补齐对应 bucket 的映射。
3. `src/workspace/style-library/style-library.json`：新增中文目录条目，`preview`/`poster` 路径预留（`/styles/<id>.mp4` / `.jpg`），`attribution` 先写占位句（见流程 B 末尾的精确格式）。
4. `server/general/kit/styles/` 目录与白名单一一对应。

最后改测试断言：`server/standard.test.ts` 第 3 行的白名单长度数字改为新总数（出现多处）；若原来用某个真实 id 当「被拒绝的 Pro 风格」样本（如 `dark-keynote`），它现在已在白名单会导致 `201≠400`，改成虚构 id `pro-disabled-style`。

## 流程 B：批量渲染缺失预览

1. 拿视频清单：从上游 raw 拉取 `styleboard/films_repo.json`（见 [references/upstream-sources.md](references/upstream-sources.md)），存到 `_upstream/`。它含 `base`（影片托管根）和每个风格 `<slug>` 的 `bytes`/`sha256`。
2. 算缺失：白名单中 `public/styles/<id>.mp4` 或 `.jpg` 不存在的。
3. 下载：`curl.exe -sSL --fail -o _upstream/films/<id>.mp4 <base><id>.mp4`，逐文件校验 `bytes` 和 `sha256`；失败重试。**必须用 `curl.exe`**（PowerShell 的 `curl` 是 `Invoke-WebRequest` 别名，参数不兼容）。并发 6 即可。
4. 裁剪 + 抽帧（用 RUOK 运行时的 ffmpeg/ffprobe，路径由 `server/general/runtime-tools.ts` 的 `ffmpegPath()`/`ffprobePath()` 给出，本机为 `D:\Program Files\ffmpeg\bin\`）：

   选段规则（与现有 57 个预览的选段统计对齐，`poster ≈ start+3` 高度一致，`start/dur` 中位数 0.467）：
   - `start = clamp(round(dur × 0.45, 1位小数), 4, dur − 8)`（避开片头标题卡和片尾卡）
   - `end = start + 6`，`poster = start + 3`

   裁剪命令（输出与现有预览参数逐字段一致：640×360 / 15fps / H.264 High / yuvj420p / 6.0s / 无音频 / faststart）：
   ```
   ffmpeg -y -ss <start> -i <src> -t 6 -vf "scale=640:-2,fps=15" -an -c:v libx264 -profile:v high -pix_fmt yuvj420p -movflags +faststart public/styles/<id>.mp4
   ffmpeg -y -ss <poster> -i <src> -frames:v 1 -vf "scale=640:-2" public/styles/<id>.jpg
   ```
5. 更新 attribution：把该条目占位句 `Preview not yet rendered in this RUOK build; path /styles/<id>.mp4 reserved.` 精确替换为
   `Changes: trimmed to 6 s (<start>–<end> s), downscaled to 640 px, 15 fps, re-encoded H.264 without audio; poster = one frame at <poster> s, downscaled.`
   用字符串精确替换，不要 `JSON.stringify` 重写整个文件（会破坏格式、产生巨大 diff）。

选段是统计规则批量取的；若某风格片段不够代表性，告知用户后单独调整该 id 的 start 重渲。

## 文档

接入后同步三处（保持来源可追溯）：

- `RUOK-PROVENANCE.md`：追加本次批量记录（上游 commit、范围、许可）。
- `server/general/kit/ATTRIBUTION.md`：新增段落说明本次补入的风格数量与上游来源。
- `NOTICE`：反映最新接入数量、✦ 三风格需图像生成器、未渲染预览数量（渲染完成后清零）。

## 验证

```powershell
$env:CHROME='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE=$env:CHROME
node --experimental-strip-types --test server/standard.test.ts server/general-jianying-captions.test.ts server/adu-render.test.ts
npm.cmd run typecheck
```

必须全绿。`standard.test.ts` 输出应确认「已遍历本版实际风格 N 种」与白名单一致。`adu-render.test.ts` 端到端用例需真实通过（浏览器缺失导致跳过要明确报告，不能宣称通过）。

预览验收：白名单 100 个，`public/styles/` 下 `<id>.mp4` + `<id>.jpg` 齐全；抽检 2–3 个新 mp4 用 ffprobe 核对 640×360 / 15fps / 6.0s / h264 / yuvj420p / 单流无音频。

## 已知坑

见 [references/pitfalls.md](references/pitfalls.md)，包括：沙箱拦截 git、PowerShell 5 语法、`output-signature.json` 冻结文件不可改、整包 tarball 截断、`dark-keynote` 测试样本等。

## 汇报与提交

报告：接入/渲染的风格数、白名单与预览是否 100% 齐全、测试通过与跳过数量、未覆盖项（如 text-presets 未像素级抽检）。**不要主动提交或推送**——用户说「提交」才 commit，且不 push。提交前 `git status` 确认只有预期改动，`_upstream/` 在仓库外不会入库。
