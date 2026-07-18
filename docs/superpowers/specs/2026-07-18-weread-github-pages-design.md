# 枕书：GitHub Pages 全量微信读书同步设计

## 背景

当前 Sites 版本已经能展示微信读书数据，但私有 Sites 访问控制会在边缘层拦截无登录请求，导致 GitHub Actions 无法直接调用站点同步 API。用户希望尽量不依赖 GPT、Codex、Sites 自动化或浏览器登录，改为完全依赖 GitHub。

## 目标

- GitHub Actions 每天北京时间 23:30 自动同步微信读书。
- 同步直接调用微信读书网关，不调用 Sites API。
- GitHub Pages 发布静态网站，不需要 D1、Worker、Codex heartbeat 或浏览器登录。
- 网站展示当前能取到的全部书架、全部电子书阅读进度、全部划线、全部个人想法/点评和阅读统计。
- 每次同步覆盖最新完整数据，不保留每日历史归档。
- 页面复用“枕书”的现有视觉语言，但可移除无法在静态站安全执行的“立即同步”按钮。

## 架构

仓库新增 `github-pages/` 作为 GitHub Pages 静态站目录：

- `github-pages/index.html`：页面骨架。
- `github-pages/assets/styles.css`：复用当前枕书样式风格。
- `github-pages/assets/app.js`：读取 JSON、渲染书架、批注、统计、搜索和标签切换。
- `github-pages/data/reading-room.json`：最新完整同步结果。

仓库新增同步脚本：

- `scripts/export-weread-data.mjs`：使用 `WEREAD_API_KEY` 调用微信读书网关，生成 `github-pages/data/reading-room.json`。

GitHub Actions workflow 每天 15:30 UTC 运行，对应北京时间 23:30；也支持手动触发。

## 数据口径

同步脚本按以下顺序执行：

1. `/shelf/sync` 获取书架，包括电子书、专辑/有声书和文章收藏入口。
2. 对所有电子书调用 `/book/getprogress` 获取当前进度。
3. `/user/notebooks` 遍历全部有笔记的书。
4. 对每本笔记书调用 `/book/bookmarklist` 获取全部划线。
5. 对每本笔记书调用 `/review/list/mine` 获取全部个人想法/点评。
6. 调用 `/readdata/detail` 获取 weekly、monthly、annually、overall 四类阅读统计。

全部请求都使用 `skill_version: "1.0.3"`，业务参数平铺在请求体顶层。遇到 `upgrade_info` 立即失败退出，不写入半成品文件。

## GitHub Secrets

需要在 GitHub 仓库配置：

- `WEREAD_API_KEY`：微信读书 API Key。

不再需要 `SYNC_AUTOMATION_TOKEN`、`SITES_BASE_URL` 或 Sites 旁路凭据。

## 页面行为

静态站首屏展示：

- 书架条目总数。
- 笔记总数，口径为划线数量 + 想法/点评数量 + 书签数量。
- 累计阅读时长。
- 最近同步时间和同步状态。

书架页展示全部当前书架条目；电子书显示阅读进度和微信读书深度链接，专辑标注为有声书，文章收藏入口标注为收藏。

批注页展示全部划线和个人想法/点评，按时间倒序排列；可搜索书名、原文和想法内容。

静态站不提供“立即同步”按钮，因为 GitHub Pages 前端不能安全持有 `WEREAD_API_KEY`。页面提供最近同步状态；需要立即同步时到 GitHub Actions 手动运行 workflow。

## 测试与验收

- 同步脚本在 mocked fetch 下验证 gateway 请求格式、分页、统计模式和输出 JSON 结构。
- 静态页面测试验证页面不包含旧的 Sites API 同步依赖，能引用 `data/reading-room.json`。
- 运行现有单元测试、lint 和生产构建。
- 本地用示例 JSON 打开静态站，确认书架、批注和统计能渲染。
- GitHub 仓库配置 `WEREAD_API_KEY` 后，手动运行 workflow，确认 Pages artifact 包含最新 JSON 和站点文件。

## 非目标

- 不保留每日历史快照。
- 不使用 Sites API、D1、Worker 同步入口或 Codex heartbeat。
- 不把微信读书 API Key 写进前端或仓库。
- 不提供浏览器端直接同步按钮。
