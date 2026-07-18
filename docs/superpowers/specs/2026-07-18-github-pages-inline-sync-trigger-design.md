# 枕书：页面内手动同步触发器设计

## 背景

GitHub Pages 是静态站点，当前顶部“同步状态”按钮直接打开 `reading-room.json`，既不是手动同步，也不适合作为用户界面。静态网页没有安全权限调用 GitHub Actions 的 `workflow_dispatch`；把 GitHub Token 放进前端会泄露仓库操作权限。

用户希望点击手动同步后留在当前页面，看到等待状态，完成后自动显示最新数据。为此，在 GitHub Pages 和 GitHub Actions 之间增加一个极窄的 Cloudflare Worker 触发器。Worker 只负责验证同步口令、触发 workflow 和查询运行状态；阅读数据仍只由 GitHub Actions 从微信读书导出并发布。

本设计与现有“书架 6 本/页、批注日历”前端增强配套，不改变 `reading-room.json` 数据格式和每日自动同步计划。

## 目标

- 顶部按钮改名为“手动同步”，不再打开原始 JSON。
- 点击后在当前页面打开轻量同步面板，不跳转到 GitHub 或其他页面。
- 首次使用时输入同步口令；口令仅保存于当前浏览器会话。
- Worker 用隐藏的 GitHub 凭据触发 `main` 分支的 `weread-sync.yml`。
- 页面显示等待、运行、成功、失败和超时状态；成功后自动重新加载最新 JSON。
- 失败时保留旧数据，并给出可理解的错误提示。

## 非目标

- 不把 GitHub Token、微信读书 API Key 或同步口令写进仓库、HTML 或 JavaScript 常量。
- 不让 Worker 读取、缓存或返回私人阅读内容。
- 不把同步逻辑从 GitHub Actions 搬到 Worker。
- 不取消每天北京时间 23:30 的自动同步。
- 不要求用户离开阅读网站去操作 GitHub 页面。

## 方案比较

### 方案一：Cloudflare Worker 触发和状态代理（采用）

Worker 保存最小权限的 GitHub Actions Token 和同步口令。页面通过 HTTPS 请求 Worker，Worker 调用 GitHub REST API 触发 workflow，再代理运行状态。

优点是满足“当前页面等待”和“真正立即手动同步”，凭据不进入公开站点；Worker 不接触阅读数据。代价是需要部署一个很小的额外服务和两个 Secret。

### 方案二：页面只轮询下一次自动同步

按钮显示等待并轮询 JSON，但没有权限启动 workflow，只能等定时任务。

该方案不需要 Worker，却无法提供真正的手动同步，用户会再次遇到“点击后没有立即同步”的困惑。因此不采用。

### 方案三：在前端调用 GitHub API 并携带 Token

实现最直接，但 Token 会被网页源码、浏览器开发者工具和网络请求看到，等同于公开仓库写权限。因此禁止采用。

## 架构

```text
GitHub Pages
  └─ POST /sync/start + 同步口令
        ↓
Cloudflare Worker（只持有 GitHub Token）
  ├─ POST GitHub workflow_dispatch
  └─ GET GitHub Actions runs
        ↓
GitHub Actions → 微信读书 API → reading-room.json → GitHub Pages
```

建议目录为 `sync-worker/`，包含 Worker 入口、部署配置和 mock 测试；GitHub Pages 仅配置一个公开的 Worker URL，不配置任何凭据。

## Worker 接口

### `POST /sync/start`

请求头：

- `Content-Type: application/json`
- `X-Sync-Key: <用户输入的同步口令>`
- `Origin` 必须为配置的 GitHub Pages 地址。

请求体为空。Worker 先做 Origin 校验、口令常量时间比较和运行冷却检查，再调用：

`POST /repos/CN-HeJian/zhenshu-reading-room/actions/workflows/weread-sync.yml/dispatches`

请求体为 `{ "ref": "main" }`。成功后返回 `{ "acceptedAt": "<ISO 时间>" }`；GitHub API 的 204 响应不直接暴露给页面。

如果已有运行中的同步，Worker 返回该运行的状态时间点而不是再次触发。最近 5 分钟刚成功时返回冷却提示，防止公开页面被重复点击消耗 Actions 和微信读书请求。

### `GET /sync/status?after=<ISO 时间>`

请求头继续携带 `X-Sync-Key`。Worker 查询该仓库最近的 workflow runs，寻找 `created_at >= after` 的 `weread-sync.yml` 运行，并返回统一状态：

- `waiting`：GitHub 尚未列出新运行。
- `running`：已找到运行但仍在执行。
- `success`：导出和 Pages 部署成功。
- `failure`：workflow 失败，附安全错误摘要。
- `timeout`：超过页面等待上限，旧数据仍保留。

返回值只包含状态、时间、运行 ID 和安全错误码，不返回 Token、日志、划线正文或个人想法。

Worker 对 OPTIONS 返回严格的 CORS 头，仅允许正式 GitHub Pages Origin。所有接口使用 HTTPS；口令不写入 URL，不写日志。

## 页面交互

- 顶部按钮文案为“↻ 手动同步”。
- 点击后打开站内同步面板，不改变 URL。
- 没有会话口令时显示口令输入框；验证成功后写入 `sessionStorage`，页面刷新后需重新输入。
- 已有会话口令时直接请求 `/sync/start`。
- 状态面板显示“准备中 → GitHub 已接收 → 正在同步 → 发布完成”的阶段文案和最近数据摘要。
- 每 2 秒轮询 `/sync/status`，最长等待 10 分钟。
- `success` 后使用带时间戳的 JSON URL 重新读取数据，刷新书架、批注、日历和统计；不打开 JSON 原文。
- `failure`、错误口令、冷却或超时均留在面板内，提供“重试”按钮和安全提示。
- 页面关闭面板不会取消 GitHub Actions，只停止当前浏览器轮询；再次点击可继续查询最近运行。

## 安全与可靠性

Worker Secrets：

- `GITHUB_ACTIONS_TOKEN`：仅允许目标仓库 Actions 写入的 fine-grained token。
- `SYNC_TRIGGER_KEY`：与用户输入口令匹配的长随机值。
- `ALLOWED_ORIGIN`：正式 GitHub Pages 地址。

Worker 不允许任意仓库、任意 workflow 或任意 ref，只能触发固定仓库的固定 workflow 和 `main`。口令比较使用常量时间算法；请求失败、GitHub 限流和网络错误都返回统一安全错误。运行冷却和“已有运行复用”降低重复触发风险。

GitHub Actions 本身继续负责 API Key、完整导出、原子写入和 Pages 发布；任何同步失败都不会覆盖上一份成功 JSON。

## 测试与验收

Worker 测试覆盖：

- 正确 Origin 和口令可以触发固定 workflow。
- 错 Origin、缺口令、错口令被拒绝。
- 已有运行或冷却期不会重复触发。
- GitHub 204、运行中、成功、失败、限流和网络错误映射为统一状态。
- 响应不包含 Token、口令、日志正文或阅读内容。

静态页面测试覆盖：

- 顶部按钮不再链接 `reading-room.json`，而是打开站内同步面板。
- 页面包含状态、口令、重试和成功刷新逻辑。
- 同步口令只写入 `sessionStorage`，不写入 URL 或 HTML。
- 书架仍为每页 6 本。

上线验收：

1. 配置 Worker 的三个 Secret 和 Pages Origin。
2. 手动点击页面按钮，输入口令。
3. 确认页面不跳转，状态进入运行中。
4. 确认 Actions 成功并发布 Pages。
5. 确认页面自动刷新后显示最新同步时间、书架和批注。
6. 用错误口令和重复点击验证不会触发额外 workflow。

## 部署顺序

1. 先部署 Worker 并配置 Secrets。
2. 再更新 GitHub Pages 前端中的 Worker URL 和同步面板。
3. 推送 `main`，确认自动 workflow 成功。
4. 完成一次页面内手动同步验收后，再将按钮作为正式入口保留。
