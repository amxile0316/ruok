# 字体池与 text-presets 生成规则

RUOK 的 `text-presets.json` 必须使用**有 fontFile 的字体**，否则剪映测试的 `fontFile` 非空断言会失败。字体回退机制见 `server/general/jianying-captions.ts`：`fontFile: fontFile ?? fallbackFontFile`，测试夹具提供最终回退。

## 可用字体池（15 对，只能从这里挑）

| 键 | font（family） | fontFile | fallback | 典型 weight |
|----|----------------|----------|----------|-------------|
| AD | Architects Daughter | ArchitectsDaughter-Regular.ttf | Kaiti SC | 600 |
| B6 | B612 | B612-Regular.ttf | PingFang SC | 800 |
| DG | Dela Gothic One | DelaGothicOne-Regular.ttf | PingFang SC | 800 |
| BL | Barlow Semi Condensed | BarlowSemiCondensed-SemiBold.ttf | PingFang SC | 700 |
| IT | Inter Tight | InterTightwght.ttf | PingFang SC | 800 |
| IN | Inter | Inter.ttf | PingFang SC | 800 |
| CO | Cormorant Garamond | CormorantGaramond-VF.ttf | Songti SC | 700 |
| NS | Noto Serif SC | NotoSerifSC[wght].ttf | Songti SC | 700 |
| MS | Ma Shan Zheng | MaShanZheng-Regular.ttf | Kaiti SC | 400 |
| CI | Cormorant Garamond (Italic) | CormorantGaramond-Italic-VF.ttf | Songti SC | 500 |
| JO | Jost | Jost.ttf | PingFang SC | 800 |
| OV | Overpass | Overpass-var.ttf | PingFang SC | 800 |
| PM | IBM Plex Mono | IBMPlexMono-Medium.ttf | Menlo | 700 |
| CV | Caveat | Caveat-VF.ttf | Kaiti SC | 600 |
| LC | Long Cang | LongCang-Regular.ttf | Kaiti SC | 400 |

**不要**自造字体，也不要引用上游 `style.json` 里 fontFile 为空的映射（如 Noto Serif SC→PingFang SC、Noto Sans SC→Microsoft YaHei 这类只有 family 没有字体文件的）。

## 风格 → 字体映射

按风格气质选字体键（示例映射，新增风格沿用同类气质）：

- 等宽/技术/档案/仪器类（archive-lighttable、briefing-board、dark-documentary、lidar-survey、microscope、satellite-briefing、security-xray、thermal-camera、spy-titles）→ `PM`（IBM Plex Mono）
- 几何/无衬线现代（bauhaus-shapes、flat-space-explainer、pictogram-motion、silhouette-rhythm）→ `IN`/`IT`/`JO`
- 优雅衬线（art-deco）→ `CO`
- 手写/粉笔（chalkboard）→ `CV`
- 未映射的缺省 → `IN`（Inter）

## text-presets.json 结构

每个风格生成 3 个预设（标题 / 字幕 / 标签）+ `finishes: ["none"]`：

```json
{
  "presets": {
    "<中文名>标题": { "font": "...", "fontFile": "...", "fallback": "...", "layout": "content", "weight": <tw>, "size": 0.078, "color": "<title>", "accent": "<accent>", "lineHeight": 1.3, "roles": ["title"] },
    "<中文名>字幕": { "font": "...", "fontFile": "...", "fallback": "...", "layout": "content", "weight": 500, "size": 0.042, "color": "<caption>", "accent": "<accent>", "lineHeight": 1.35, "roles": ["caption"] },
    "<中文名>标签": { "font": "...", "fontFile": "...", "fallback": "...", "layout": "content", "weight": 600, "size": 0.03, "color": "<accent>", "accent": "<accent>", "lineHeight": 1.3, "roles": ["label"] }
  },
  "finishes": ["none"]
}
```

配色（title/caption/accent）从该风格 `STYLE.md` 的 Colour logic 段提取 hex。预设未做像素级渲染验证——这是已知限制，后续抽检。
