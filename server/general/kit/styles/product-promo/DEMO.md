<!-- 来源 / source: RUOK 自写。结构借鉴 video-shotcraft (Apache-2.0) 的镜头配方组织方式，
     模板、分镜与文案均为 RUOK 原创；未包含上游 demo 工程或素材。见 ../../ATTRIBUTION.md。 -->

# 产品宣传片 · DEMO — 完整模板与分镜

本风格包自带一个**可运行的最小闭环模板**：`template/`。它不是要复制的样片，而是一条 20 秒的骨架，
把 5 条镜头配方串成完整叙事。用户的产品名、卖点、功能点替换文本即可出片。

## 1. 完整模板的目录

```
template/
  index.html                     根页面：唯一带 data-composition-id 的根节点，5 个画面片段 + 1 条字幕轨
  compositions/
    01-opening-hook.html         开场钩子      0.0 – 4.0 s
    02-product-closeup.html      产品特写      4.0 – 9.0 s
    03-feature-demo.html         功能演示      9.0 – 15.0 s
    04-transition-wipe.html      转场         15.0 – 16.5 s
    05-closing-cta.html          结尾 CTA     16.5 – 20.0 s
    captions.html                字幕轨（一句一条）0 – 20 s
```

没有 `assets/`：模板只用排版、几何与 CSS 光，不依赖任何外部图片或音频，离线可渲染。
要换成用户的产品图，把文件放进 `assets/`，在对应子页面里用 `<img src="../assets/…">` 替换 `.plate`。

字体只用通用字族（`serif` / `sans-serif`），保证任何机器都能渲染且通过 `hfx check`。
要指定品牌字体时，把字体文件放进 `fonts/` 并写 `@font-face`，再把对应 `font-family` 换成该字体名。

## 2. 分镜（20 秒 / 1920×1080 / 30fps）

| 时间 | 片段 | 画面 | 文案（模板里的占位） | 可调参数 |
|---|---|---|---|---|
| 0.0–4.0 | 开场钩子 | 网格 + 扫描线掠过，两行标题错开升起 | `RUOK · PRODUCT FILM` / `把复杂讲成` / `20 秒` | `--scan-speed`、标题字号、铜色高亮词 |
| 4.0–9.0 | 产品特写 | 铜边圆盘居中，锥形光扫过，产品名与一句 tagline | `RUOK ONE` / `一枚问号，装下整条流水线` | `--ring-size`、`--sweep-angle`、`--sweep-duration` |
| 9.0–15.0 | 功能演示 | 三行步骤卡按 220ms 依次点亮，进度条右移 | `01 拆本` / `02 配方` / `03 出片` | `steps[]`、`--step-gap`、`--fill` |
| 15.0–16.5 | 转场 | 铜绿斜带扫过，压一个数字标签 | `3× 更快` | `--angle`、`direction`、`band` 宽度 |
| 16.5–20.0 | 结尾 CTA | 问号圆盘落位，青铜药丸按钮呼吸两次，网址 | `现在开始` / `ruok.app` | `--halo`、按钮宽度、URL |
| 0.0–20.0 | 字幕轨 | 下三分之一，一句一条 | 2 句 | 每句 `data-start` / `data-duration` |

字幕只有 2 句，因为标题与功能卡已经承担了大部分信息；功能演示段画面已满，不再叠字幕。

## 3. 根页面怎么写

```html
<div id="root" data-composition-id="product-promo"
     data-width="1920" data-height="1080" data-duration="20" data-no-timeline>
  <div data-composition-id="shot-1-hook"
       data-composition-src="compositions/01-opening-hook.html"
       data-start="0" data-duration="4"
       data-track-index="1" data-track-kind="graphics"
       data-width="1920" data-height="1080"></div>
  <!-- 其余 4 个画面片段同样写法；字幕片段 data-track-kind="captions" -->
</div>
```

要点：

- 根节点只放带时间的片段（画面、字幕、音频），**不要把整段动效写在一个 div 里**。
- 每个子页面是一个 `<template>`，里面是它自己的 `<style>` 与根节点；`data-composition-id` 与宿主一致。
- 字、卡片、步骤都必须写在对应子页面里，用户才能在时间线上单独改。
- 子页面里只写 CSS `@keyframes` + `animation`；不用 GSAP、不用 `element.animate()`、不用定时器。

## 4. 怎么再加一条配方

1. 在 `template/compositions/` 新建 `06-<name>.html`，复制任意现有子页面当骨架，改根节点 id 与文案。
2. 在 `template/index.html` 里加一个宿主 div：`data-start` 接在上一段之后，`data-duration` 按配方时长，
   `data-track-kind="graphics"`，`data-track-index` 用同一个值。
3. 在总时长 `data-duration` 上加同样的秒数；如果总时长变了，检查字幕轨的覆盖范围。
4. 把这条配方补进 `STYLE.md` 第 4 节的表：用途、时长、可调参数；DEMO 的分镜表也加一行。
5. 跑一次检查：在影片目录执行 `hfx check`；画面片段数量必须 ≥ max(2, 总秒数/5)，单段 ≤ max(8, 总秒数/2)。

## 5. 参数怎么改（不改结构）

每个子页面的根节点上有一组 CSS 变量，改一行就能换尺寸/速度/角度，不需要动布局：

```css
#closeup{ --ring-size: 420px; --sweep-angle: 24deg; --sweep-duration: 1.6s; }
#demo{ --step-gap: 220ms; --fill: 72%; }
#wipe{ --angle: -12deg; --band: 320px; }
#cta{ --halo: 18px; }
```

文案（标题、tagline、功能三条、CTA、网址）都是正常 HTML 文本，用户在编辑页里逐条改。

## 6. 出片前自检

- `hfx check`：片段数量、每段时长、字幕是否一句一条、声音是否一声一段。
- `hfx look 12`：抽 12 帧看构图；重点看开场 0.5s、特写中段、CTA 落位三帧。
- 抽帧里出现文字溢出、按钮压边、字幕出安全区，先改版式再出片。
