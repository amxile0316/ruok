# 署名 / Attribution

OpenTake 通用剪辑的出片工具包里，下列文件来自 **lemo-opuscar**（https://github.com/lemomo-ai/lemo-opuscar ，提交 3961ddb3d24d8876e0e2754f7790d66908acee51），© 2026 LemoLab，按 MIT 许可证使用，许可证全文见 `LICENSE.lemo-opuscar`。内容未改动，只在文件开头加了一行来源说明。

| 本目录中的文件 | 上游文件 |
|---|---|
| `styles/<风格>/STYLE.md`（Standard 上游 10 种） | `styles/<风格>/STYLE.md` |
| `styles/<风格>/DEMO.md` | `styles/<风格>/DEMO.md`（另加一段 OpenTake 说明：demo 源码未随附） |
| `guides/DIRECTOR.md`、`guides/TECHNIQUE.md` | `DIRECTOR.md`、`TECHNIQUE.md` |
| `web/lib.js` | `core/lib.js` |
| `web/three-post.js` | `core/three/post.js` |
| `web/crt.js` | `core/post/crt.js` |
| `audio/sfx.py` | `core/audio/sfx.py` |

lemo-opuscar 的样片、静帧（CC BY 4.0）、采样库和配音素材都不在这个工具包里。

## product-promo（RUOK 自写）

`styles/product-promo/` 下的 `STYLE.md`、`DEMO.md`、`text-presets.json` 与 `template/`（20 秒 HyperFrames 模板及其分镜页）都是 RUOK 原创，随本仓库同许可分发，不含第三方素材。

**思路来源**：镜头配方与镜头词典的组织方式借鉴自 **video-shotcraft**（https://github.com/Vincentwei1021/video-shotcraft ，Apache License 2.0）。只借鉴了「按能力拆分可复用镜头 + 每条给出用途、时长、参数」的结构；没有复制其源码、素材、文案或 demo 工程，因此不构成衍生作品。该项目的 Apache-2.0 许可全文见 https://www.apache.org/licenses/LICENSE-2.0 。

样片 `public/styles/product-promo.mp4` 与海报由 RUOK 自己的渲染器从上述模板渲染（静音、裁剪 6 秒、缩放到 640px），不是上游样片。

其余文件（`film.mjs`、`lib/`、`audio/wav.py`、`MANUAL.md`）是 OpenTake 自己写的。页面加载的 three.js、d3 模块来自 OpenTake 运行环境的 node_modules，各自的许可证随包附带。
