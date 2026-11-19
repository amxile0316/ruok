# RUOK 2.1.0 发布说明

RUOK 2.1.0 在 2.0.0 的模块版图上补了一条可走通的链路：智能选题 → 文案发布 → 运营分析。三个模块原本各自保存数据，热门选题要手工复制到写稿页，作品数据也要重新录一遍；这一版把交接做进页面，标题、钩子、平台和大纲不再靠人搬运。

版本号从 2.0.0 升到 2.1.0，只改 `package.json` 与 `package-lock.json`；关于页仍从 `package.json` 读取版本，上游基线仍是 `src/settings/ruok-version.ts` 里的 OpenTake Standard 1.1.3。这一版没有新增依赖，也没有联网接口。

## 选题 → 文案发布

- 智能选题的每张卡片新增「去写稿」，选题篮每条也新增写稿按钮；卡片上的「复制脚本」保留。
- 交接内容是标题、开场钩子、编号大纲、平台和角度，写进一次性草稿后跳到 `/publish`。
- 文案发布页接住草稿：素材框直接填好，平台跟着切到对应站点，素材上方显示「来自选题：标题 · 角度」，明确这段文字从哪来。
- 选题篮里只存了标题和钩子的条目也能带去写稿，不会生成空大纲。

## 文案发布 → 运营分析

- 生成结果下方新增「记入运营分析」。标题、平台、钩子和题材随草稿带过去，播放、点赞、评论等数字留空，由用户按后台实际数据填写。
- 运营分析页接住草稿后自动打开录入表单，表单顶部显示「来自文案发布」；保存或取消后来源提示一并清掉，不会在下一次录入时残留。
- 平台名在交接时转成运营分析使用的中文名（小红书 / 抖音 / 视频号 / B 站 / YouTube / X），未知平台回落到小红书，不让表单停在不存在的选项上。

## 交接实现与边界

- 新增 `src/workspace/handoff.ts`，集中维护发布平台清单、两种草稿的类型与读写。草稿存在 `sessionStorage`，键为 `ruok.handoff.publish.v1` 与 `ruok.handoff.analytics.v1`。
- 草稿只消费一次：读取时立即删除，刷新页面不会重复带入旧内容；读到脏数据（缺字段、平台不在清单里、JSON 损坏）直接按空处理，不预填半套内容。
- `PublishPage` 的平台常量迁到 `handoff.ts`，页面只做展示；选题素材的拼接函数也集中到这一处，卡片复制与写稿使用同一份文本。
- 交接不写工程、不写设置、不调用智能体、不发网络请求；跨窗口不共享，关掉窗口即失效。

## 样式

- 新增 `publish-origin`、`an-origin`、`topics-btn--go`、`topics-icon--go` 四处样式，沿用各页现有的主题令牌（深色 / 浅色 / 烟褐），没有引入新的颜色值。
- 写稿入口在选题页用强调色描边，和「已在选题篮」的选中态区分。

## 验证记录

| 步骤 | 结果 | 说明 |
|---|---|---|
| `npm run typecheck` | 通过 | `tsc -p tsconfig.json` 无输出 |
| `node --test server/handoff.test.ts` | 通过 | 新增 4 条：大纲拼接、只有标题和钩子、平台转名、平台清单顺序 |
| 相关服务端测试 | 通过 | `handoff`、`publish-api`、`analytics-model`、`talk-plan`、`reader-api` 合计 20 条 |
| `node scripts/build-desktop-ui.mjs` | 通过 | 2078 modules，产物约 1.10 MB JS / 702 KB CSS |
| 浏览器实测 | 通过 | 选题卡片 → 写稿 → 生成文案 → 记入运营分析；两处来源提示、素材框、录入标题均符合预期 |

## 已知限制

- 完整 `npm test` 未跑完：本机环境中 `server/standard-upgrade.test.ts` 会等待网络且没有超时，整轮停在那个文件；该测试与本次改动无关，相关模块测试已单独通过。
- 仍未产出安装包：缺 Visual Studio C++ 生成工具（MSVC x64 + Windows SDK），`npm run build:native` 不可用；macOS 构建未验证。
- 更新通道保持关闭：`upgrade.json` 的 `endpoint` 仍为空，未配置更新源时不发起网络请求。
- 交接只在当前窗口内有效，且只覆盖选题的四个平台；YouTube 与 X 只能从文案发布页手动选择。
- 运营分析仍存本机 `localStorage`，没有账号同步；交接只带内容字段，播放与互动数据必须真实录入。
- 发布新安装包前仍需重新生成并复核 `THIRD-PARTY-LICENSES.json`、`NOTICE`、`licenses/npm/**`；本次没有新增依赖，`THIRD-PARTY-LICENSES.json` 未重生成。

## 许可

RUOK 是 OpenTake Standard 的修改版本，按 AGPL-3.0-only 分发；OpenTake 名称与 T 图标不包含在代码许可内，详见 `LICENSE`、`TRADEMARK.md`、`NOTICE` 与 `RUOK-PROVENANCE.md`。
