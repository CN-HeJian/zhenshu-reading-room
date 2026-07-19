# 枕书：仅保留定时同步设计

## 决策

网站保留 GitHub Actions 每天北京时间 23:30 的定时同步，同时继续支持 GitHub Actions 自带的 `workflow_dispatch` 手动运行。GitHub Pages 页面只展示已经发布的静态阅读数据，不提供手动同步按钮、口令输入或等待面板。

## 变更范围

- 保留 `.github/workflows/weread-sync.yml` 的 `schedule` 和 `workflow_dispatch` 触发方式。
- 移除页面内手动同步控件及其前端轮询逻辑。
- 移除 Cloudflare Worker 触发器、部署工作流和相关凭据配置。
- 保留书架分页、批注日历、搜索和阅读统计。

## 验收

- 页面顶部不出现“手动同步”入口或同步弹窗。
- 定时工作流仍包含 `30 15 * * *`，对应北京时间 23:30。
- GitHub Actions 工作流仍能通过 `workflow_dispatch` 手动运行。
- 静态数据加载、分页、日历和完整测试继续通过。
