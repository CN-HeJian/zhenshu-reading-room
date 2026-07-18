# 枕书：微信读书 API 适配器 1.0.4 升级设计

## 背景

“枕书｜我的阅读札记”已经改为 GitHub Actions 定时同步、GitHub Pages 展示。首次手动运行失败并不是 `main` 分支、Pages 或 Secret 配置错误，而是同步脚本仍以 `skill_version: "1.0.3"` 调用微信读书网关；网关要求升级到 1.0.4，因而拒绝继续执行。

微信读书 Skill 本质上是网关协议说明，不是网站运行时必须依赖的软件。网站可以把该协议固化为仓库中的 API 适配器，由 GitHub Actions 直接调用微信读书网关，不需要 Codex、GPT、本地 Skill、浏览器或 Sites 服务参与日常同步。

本设计补充并替代现有 GitHub Pages 同步设计中关于微信读书协议版本和字段映射的部分；页面样式、展示范围和 GitHub-only 架构保持不变。

## 目标

- 所有网关请求固定携带 `skill_version: "1.0.4"`，业务参数继续平铺在请求体顶层。
- GitHub Actions 直接执行 API 适配器，继续支持每日定时运行和手动运行。
- 同步并覆盖保存当前完整书架、电子书进度、全部划线、全部个人想法/点评，以及 weekly、monthly、annually、overall 阅读统计。
- 优先使用 API 返回的 `deepLink`，不再手工拼接 `weread://` 链接。
- 同步失败时不覆盖上一份成功数据，不泄露 `WEREAD_API_KEY` 或私人阅读内容。
- 不修改现有页面视觉样式，不增加历史快照、日报、周报或 AI 总结。

## 非目标

- 不在每次运行时自动下载并执行最新版 Skill。
- 不让 GitHub Pages 前端直接持有或调用 `WEREAD_API_KEY`。
- 不恢复 Codex heartbeat、浏览器点击或 Sites API 作为生产同步链路。
- 不改变网站当前“展示全部最新数据”的数据口径。
- 不自动修改 GitHub Secret。

## 方案比较

### 方案一：固定版本的 API 适配器（采用）

把官方 1.0.4 协议实现到仓库代码中，并通过测试锁定请求格式和字段映射。版本升级是一次明确的代码变更，必须经过测试后部署。

优点是完全由 GitHub 运行、行为可复现、失败原因清楚；协议变化不会在无人检查时悄悄改变网站数据。代价是官方再次升级协议时，需要再更新适配器。

### 方案二：运行时自动下载最新版 Skill

每次 Actions 运行时读取最新 Skill 文档或版本号，再动态调整请求。

该方案看似免维护，但 Skill 可能同时改变字段、链接或错误处理语义；仅自动替换版本号无法保证兼容，动态解析文档也会引入不可预测行为。因此不采用。

### 方案三：在自动化中执行 Codex 或本地 Skill

让自动化依赖 Codex 解释 Skill 后再执行同步。

该方案与“完全依赖 GitHub、尽量不依赖 GPT”的目标冲突，也增加运行时、登录态和费用依赖。因此不采用。

## 架构与职责

数据链路保持为：

`GitHub Actions → 仓库内微信读书 API 适配器 → 微信读书网关 → reading-room.json → GitHub Pages`

代码职责如下：

- `lib/weread/core.mjs`：保存固定协议版本、构造网关请求、识别升级提示和网关错误；不再提供手工深度链接作为数据回退。
- `scripts/export-weread-data.mjs`：组织分页、批量请求和数据归一化；使用 API 返回的 `deepLink`，生成当前完整的 `github-pages/data/reading-room.json`。
- `.github/workflows/weread-sync.yml`：在 GitHub runner 中读取 `WEREAD_API_KEY`，运行测试和导出脚本，并只在导出成功后发布 Pages。
- `github-pages/`：继续使用现有静态页面和样式读取最新 JSON，不接触密钥，也不负责发起同步。

## 请求和字段规则

### 通用协议

- 每个请求均为 `POST https://i.weread.qq.com/api/agent/gateway`。
- 每个请求体都包含 `api_key`、`endpoint` 和 `skill_version: "1.0.4"`。
- 业务参数位于请求体顶层，不嵌套到额外的 `params` 对象。
- 返回非零 `errcode`、HTTP 错误或 `upgrade_info` 时终止导出。
- 日志可以记录 endpoint、阶段、计数和安全错误摘要，不记录 API Key、划线正文或个人想法正文。

### 书架和进度

- `/shelf/sync` 同步电子书、专辑/有声书和文章收藏入口。
- 书架总数继续统计 `books + albums + mp`。
- 仅对电子书调用 `/book/getprogress`；进度归一化到 0–100。
- 书架项和图书跳转优先使用响应中的 `deepLink`；缺失时保存为空，不手工拼接旧格式链接。

### 划线和个人想法

- `/user/notebooks` 遍历全部有笔记的书。
- `/book/bookmarklist` 保存全部划线。
- `/review/list/mine` 分页保存全部个人想法/点评。
- 1.0.4 响应出现 `abstract` 时，将其作为个人想法关联的原文摘要；`range`、章节标题和章节 UID 在响应存在时一并保留，缺失时按可选字段处理。
- 页面笔记总数继续采用“划线 + 想法/点评 + 书签”的口径；网站内容列表展示划线和个人想法/点评。

### 阅读统计

- `/readdata/detail` 继续分别请求 weekly、monthly、annually 和 overall。
- 时间值按 API 定义保存为秒，页面负责格式化显示。
- 同比或环比值保留 API 返回的小数比例，不在适配器中提前转换为百分数字符串。

## 写入一致性与失败处理

导出脚本先在内存中取得并校验全部数据，完成后再一次性写入目标 JSON。任何必要接口失败时，进程以非零状态退出，workflow 跳过发布，因此线上仍保留上一份成功数据。

对 429、502、503、504 等瞬时错误允许有限次数退避重试；鉴权失败、业务错误、协议升级提示和数据结构不兼容不盲目重试。遇到新的 `upgrade_info` 时，日志提示当前版本和官方升级要求，等待人工审核协议变化后再修改适配器。

## 测试与验收

实现阶段需要覆盖：

- 所有网关请求使用 1.0.4 且业务参数平铺。
- 识别 `upgrade_info` 并在写文件前失败。
- API `deepLink` 被原样采用，缺失时不会手工生成 `weread://` 链接。
- 个人想法能够映射 `abstract`、`range` 和可选章节字段。
- 书架类型、全量分页、笔记计数、进度和四类阅读统计仍保持现有行为。
- 日志和产物不包含 API Key。
- 运行项目的测试、lint 和生产构建。

部署验收步骤：

1. 将实现推送到 `main`。
2. 在 GitHub Actions 手动运行微信读书同步 workflow。
3. 确认导出和 Pages 发布步骤成功。
4. 检查线上 `reading-room.json` 的同步时间、书架、进度、批注和四类统计均已更新。
5. 打开 GitHub Pages，确认沿用现有样式且能展示全部最新内容。

## 后续升级策略

适配器固定在 1.0.4。将来网关再次返回升级提示时，workflow 应明确失败并保留上一份成功数据；维护时先比对官方 Skill 的协议和字段变化，再通过单独代码变更、测试和手动 workflow 验收完成升级，不进行盲目自动升级。
