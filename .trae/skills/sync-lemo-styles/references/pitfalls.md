# 已知坑

同步过程中反复踩过的问题，按出现频率排列。

## 1. 沙箱拦截 git 操作

沙箱会把 `git checkout`/`git add` 的删除或某些写操作重定向到回收站，导致 git 命令行为异常或报错。**所有 git 命令加 `dangerouslyDisableSandbox: true`**。

## 2. PowerShell 5 语法

- 不支持 `&&` / `||`，用 `;` 分隔命令；条件执行用 `if ($LASTEXITCODE -eq 0)`。
- `curl` 是 `Invoke-WebRequest` 别名，参数不兼容——下载一律用 `curl.exe`。
- JSON / 字节操作优先用 node 脚本，不要用 PowerShell 字符串拼接。
- `Select-Object -Last N` 截断管道可能让 git 报退出码 -1（实际成功），看输出内容判断即可。
- 给 git 加 `--no-pager` 或设 `$env:GIT_PAGER = "cat"` 防止 pager 挂起。

## 3. vendor/adu/template/output-signature.json 是冻结文件

渲染测试或某些操作可能意外改写它（变成单行无换行）。它是 adu vendor 冻结文件，**不可提交改动**。提交前 `git status` 确认它不在改动列表；若被改，用 `git checkout -- vendor/adu/template/output-signature.json` 恢复（加 `dangerouslyDisableSandbox`）。

## 4. standard.test.ts 的「被拒绝 Pro 风格」样本

原测试用 `dark-keynote` 当白名单外被拒绝的样本，但全量接入后它已在白名单，导致返回 201 而非 400。**改成虚构 id `pro-disabled-style`**（不在白名单，稳定返回 400）。新增风格时若碰到类似「用真实 id 当反例」的测试，同样换成虚构 id。

## 5. 整包 tarball 截断

下载上游不要用 codeload 的整包 tarball（本机会截断）。用 `raw.githubusercontent.com` 逐文件下载，参考 [upstream-sources.md](upstream-sources.md)。

## 6. general-jianying-captions.test.ts 不要改计数

它是动态遍历实际风格的，没有硬编码总数。只有 `standard.test.ts` 有硬编码计数（白名单长度、library 长度），增删风格时只改 standard.test.ts。

## 7. 字体 fontFile 必须非空

`text-presets.json` 的字体只能从 [font-pool.md](font-pool.md) 的 15 对里选，fontFile 不能为空。否则 `server/general/jianying-captions.test.ts` 的 `fontFile` 断言失败。

## 8. attribution 用字符串精确替换，不要 JSON.stringify 重写

更新 `style-library.json` 的 attribution 时，用占位句 → 实际句的字符串替换。若 `JSON.parse` + `JSON.stringify` 重写整个文件，会改变缩进/格式，产生巨大 diff 且可能破坏其他条目。

## 9. 不主动提交/推送

用户说「提交」才 commit，且不 push。提交前 `git status` 确认只有预期改动：`_upstream/` 在仓库外不会入库，但要确认没有把临时脚本、日志误放进 ruok 仓库。
