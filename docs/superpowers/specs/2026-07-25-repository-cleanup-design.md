# 枕书仓库清理与公开 README 设计

## 目标

将仓库收敛为唯一的 GitHub Pages 运行方案，删除已经不参与线上流程的 Sites、Vinext、Next、D1、Cloudflare Worker 和旧手动同步入口，同时让 README 能作为公开项目首页使用。

## 当前有效链路

```text
微信读书网关
    ↓
GitHub Actions（每日同步）
    ↓
scripts/export-weread-data.mjs
scripts/analyze-reading-journey.mjs（按周生成）
    ↓
github-pages/data/*.json
    ↓
GitHub Pages 静态站
```

## 保留内容

- `github-pages/`：公开静态阅读站、样式、交互脚本和当前数据文件。
- `lib/weread/`：微信读书网关协议、客户端类型和核心数据处理逻辑。
- `scripts/export-weread-data.mjs`：完整数据导出与原子写入。
- `scripts/analyze-reading-journey.mjs`：阅读心路分析、记忆和历史归档生成。
- `.github/workflows/weread-sync.yml`：定时同步、测试、分析和 GitHub Pages 发布。
- `analysis-history/`：用于跨周期分析的历史输入和长期记忆。
- `tests/`：静态站、微信读书适配器、导出和阅读心路分析的有效测试。
- 仅服务于上述链路的 Node、TypeScript、ESLint 和测试配置。

## 删除内容

- `app/`、`worker/`、`db/`、`sync-worker/`：旧的 Vinext/Next/D1/Worker 运行时。
- `build/sites-vite-plugin.ts`、`vite.config.ts`、`next.config.ts`、`drizzle.config.ts`、`cloudflare-env.d.ts`、`.openai/hosting.json`：旧 Sites/Cloudflare 构建配置。
- `examples/d1/`、`drizzle/`：旧数据库示例和迁移。
- `scripts/run-weread-sync.mjs` 及仅测试该入口的测试：旧 Sites 手动同步链路。
- `public/` 中仅属于旧 Vinext 模板的资源；若资源不被 GitHub Pages 引用则一并删除。
- 不再描述当前架构的历史设计文档；保留与 GitHub Pages、数据导出、适配器和阅读心路有关的文档。

## README 结构

README 面向公开仓库访客，包含：

1. 项目一句话介绍和在线站点入口。
2. 功能概览：书架、进度、批注时间轴、日历、阅读心路和定时同步。
3. 数据流与架构图。
4. GitHub Actions 配置步骤和所需 `WEREAD_API_KEY` Secret。
5. 本地预览、测试、Lint 和构建命令。
6. 数据安全、密钥边界和同步失败行为。
7. 目录说明、贡献方式和许可证占位说明（不虚构现有许可证）。

## 验证标准

- 仓库中不再出现旧 Sites、D1、Worker、Vinext 运行时的源码引用。
- GitHub Pages workflow 仍能独立运行，不依赖 `.openai/hosting.json` 或旧运行时。
- `npm install` 后，`npm test`、`npm run lint` 和静态页面构建/验证命令通过。
- README 中的命令、Secret 名称、发布路径与 workflow 实际配置一致。
- 删除只涉及已确认无效的内容，不改变 GitHub Pages 页面、微信读书导出和阅读心路分析行为。
