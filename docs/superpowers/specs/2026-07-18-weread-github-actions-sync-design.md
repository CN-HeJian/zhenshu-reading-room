# 枕书：GitHub Actions 微信读书定时同步修复设计

## 背景

当前网站已经能通过服务端接口同步微信读书数据，但定时执行依赖本地 Codex heartbeat 打开浏览器点击“立即同步”。这类任务只有在 Codex 运行、浏览器状态可用、站点登录态有效时才可靠；当 Codex 或 Chrome 关闭时，23:30 的同步无法保证执行。

用户已确认新的硬约束：每天北京时间 23:30 必须在 Chrome 和 Codex 都关闭时也能运行。因此定时执行器改为 GitHub Actions，网站继续保持私有访问和现有视觉样式。

## 目标

- 每天北京时间 23:30 由 GitHub Actions 触发同步。
- 站点仍保持仅所有者可访问。
- 手动同步和访问补同步继续使用 Sites 登录所有者身份。
- 云端定时同步只能调用同步接口，不能访问或解锁网站其他内容。
- 同步失败时暴露清晰、安全的错误摘要，包括 Sites 鉴权失败、应用密钥缺失、微信读书能力升级、限流和网关失败。
- 旧本地 Codex heartbeat 不再作为生产同步机制。

## 方案

采用“私有 Sites 站点 + 同步专用服务间 token + GitHub Actions workflow”的方案。

网站新增一个同步专用鉴权分支：`manual` 和 `catch_up` 仍要求 `oai-authenticated-user-email` 与 `SYNC_OWNER_EMAIL` 匹配；`scheduled` 必须提供 `SYNC_AUTOMATION_TOKEN`，并使用常量时间比较校验。该 token 只在同步 API 中生效，不作为全站访问凭据。

GitHub Actions 每天 15:30 UTC 运行，对应北京时间 23:30。workflow 也支持 `workflow_dispatch` 手动试跑。每次运行先调用 `POST /api/sync` 创建或复用 `scheduled` 同步任务，再循环调用 `POST /api/sync/:runId/continue`，直到返回 `success`、`partial_success` 或 `failed`。

如果 Sites 边缘层对 GitHub-hosted runner 请求仍返回 403，则不降低站点隐私策略，也不把站点改公开；改走备用方案：独立 Cloudflare Worker Cron 作为同一同步接口的调用方。

## 配置

Sites 运行时新增 secret：

- `SYNC_AUTOMATION_TOKEN`：同步专用服务间 token。

GitHub repository secrets 新增：

- `SYNC_AUTOMATION_TOKEN`：与 Sites 中同值。
- `SITES_BASE_URL`：`https://zhenshu-reading-room.super-newt-0041.chatgpt.site`。

如果后续确认 Sites 需要额外的边缘旁路凭据才能从 GitHub 调用私有站点，则再新增一个 GitHub secret 保存该短期或长期旁路凭据；未确认前不把它写进代码路径。

## 接口行为

`POST /api/sync`：

- `source: "manual"` 或 `source: "catch_up"`：要求所有者登录身份。
- `source: "scheduled"`：要求 `SYNC_AUTOMATION_TOKEN`。
- 缺 token、错 token、错来源都返回 JSON 错误，不返回 HTML 泛化失败。

`POST /api/sync/:runId/continue`：

- 根据运行记录的 `source` 判断鉴权方式。
- `scheduled` 运行只能由 automation token 续跑。
- `manual` 和 `catch_up` 运行只能由所有者登录身份续跑。

`GET /api/sync/:runId` 和 `GET /api/sync/status`：

- 保持现有所有者身份要求，供网页展示使用。
- 不接受 automation token 查询私人阅读内容。

## GitHub Actions 行为

workflow 脚本使用 Node.js 标准 `fetch`，避免引入额外依赖。执行流程：

1. 读取 `SITES_BASE_URL` 和 `SYNC_AUTOMATION_TOKEN`。
2. 发送 `POST /api/sync`，请求体为 `{ "source": "scheduled" }`。
3. 如果返回 `running`，循环调用续跑接口。
4. 对 429、502、503、504 做有限指数退避。
5. 设置最大续跑次数和总耗时上限，避免无限任务。
6. 终态为 `success` 时退出 0。
7. 终态为 `partial_success` 时退出 0，但在日志中记录安全摘要。
8. 终态为 `failed` 或 HTTP 鉴权失败时退出非 0。

日志只输出运行 ID、阶段、计数、状态和安全错误码，不输出 token、微信读书原文、个人想法正文或完整 Authorization。

## 测试

新增或更新自动测试：

- 所有者登录可以执行 `manual` 和 `catch_up`。
- 未登录所有者不能执行 `manual`、`catch_up`。
- 正确 automation token 可以执行 `scheduled`。
- 缺失或错误 automation token 不能执行 `scheduled`。
- automation token 不能执行 `manual`、`catch_up` 或读取状态接口。
- 续跑接口按运行来源选择正确鉴权方式。
- GitHub Actions 脚本能在 mocked HTTP 场景下处理成功、部分成功、失败、429/5xx 重试和超时。

上线前运行 lint、测试和生产构建。

## 上线与验收

1. 实现鉴权和 workflow 后部署私有站点。
2. 在 Sites 设置 `SYNC_AUTOMATION_TOKEN`。
3. 在 GitHub repository 设置 `SYNC_AUTOMATION_TOKEN` 和 `SITES_BASE_URL`。
4. 用 `workflow_dispatch` 手动运行一次。
5. 确认同步能跑到终态，网站显示最近同步结果。
6. 再运行一次，确认幂等，不重复写入。
7. 等待或模拟下一次北京时间 23:30，确认计划任务会自动触发。

如果第 4 步因为 Sites 边缘层拒绝 GitHub runner 而失败，停止当前路线，保留已实现的窄口径服务端鉴权，然后改用 Cloudflare Worker Cron 方案继续。

## 非目标

- 不改网站现有样式或页面布局。
- 不新增日报、周报或 AI 总结。
- 不把站点改成公开。
- 不把微信读书密钥、同步 token 或访问旁路凭据写入前端。
- 不恢复本地 Codex heartbeat 作为正式生产同步机制。
