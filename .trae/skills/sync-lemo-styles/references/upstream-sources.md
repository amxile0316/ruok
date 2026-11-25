# 上游来源与获取方式

## 上游基线

- 仓库：`lemomo-ai/lemo-opuscar`（GitHub）
- 本次同步基线 commit：`f9e204293930952b61ba921cd8944d05f121beee`
- 许可：风格文本 CC BY 4.0；demo 影片同样 CC BY 4.0，归属 LemoLab。
- 上游共 99 个风格。

## 逐文件下载（不要下整包 tarball）

完整 tarball 在本机下载会被截断。用 `raw.githubusercontent.com` 逐文件下载，`curl.exe` 并发池验证。

```
https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/<commit>/styles/<id>/style.json
https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/<commit>/styles/<id>/STYLE.md
https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/<commit>/styles/<id>/DEMO.md
```

下载到仓库外 `f:\RUOK\_upstream\styles\<id>\`（不入库）。

**必须用 `curl.exe`**：PowerShell 里 `curl` 是 `Invoke-WebRequest` 的别名，参数不兼容。

## 预览视频清单 films_repo.json

上游 99 个风格的 720p demo 视频由 `lemo-opuscar-films` 仓库的 GitHub Pages 托管，清单在：

```
https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/<commit>/styleboard/films_repo.json
```

结构：
```json
{
  "base": "https://lemomo-ai.github.io/lemo-opuscar-films/",
  "films": {
    "<slug>": { "bytes": 1234567, "sha256": "..." }
  }
}
```

每个视频 URL = `base + <slug> + ".mp4"`。下载后**逐文件校验 bytes 和 sha256**，失败重试。注意 slug 与风格 id 基本一致，个别可能不同（以清单为准）。

## 本地缓存

- `_upstream\styles\<id>\{style.json, STYLE.md, DEMO.md}`：上游文本。
- `_upstream\films\<id>.mp4`：下载的完整 demo（裁剪源，体积大，不入库）。
- `_upstream\films_repo.json`：视频清单。
- `_upstream\generate-batch.mjs`、`_upstream\render-previews.mjs`：本次用的批量脚本（参考模板，不入库）。

这些都在 `f:\RUOK\_upstream\`，位于 ruok 仓库（`f:\RUOK\ruok`）之外，git 不会跟踪。
