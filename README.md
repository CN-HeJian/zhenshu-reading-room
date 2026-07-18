# 枕书｜我的阅读札记

这是“枕书”的 GitHub Pages 版本。它不依赖 Codex 自动化、浏览器登录、Sites 私有访问控制、D1 或 Worker 定时器。

GitHub Actions 每天北京时间 23:30 直接调用微信读书网关，生成最新完整数据文件：

```text
github-pages/data/reading-room.json
```

GitHub Pages 发布 `github-pages/` 目录，静态页面读取这份 JSON 展示当前完整书架、阅读进度、划线、想法/点评和阅读统计。每次成功同步都会覆盖最新数据，不保留每日历史归档。

## GitHub 配置

1. 把本仓库推到 GitHub。
2. 在仓库 Settings → Secrets and variables → Actions 中新增 secret：

```text
WEREAD_API_KEY
```

3. 在仓库 Settings → Pages 中把 Source 设置为 GitHub Actions。
4. 到 Actions 页面手动运行 `WeRead GitHub Pages sync`，确认第一次同步和发布成功。

之后 workflow 会每天 15:30 UTC 自动运行，也就是北京时间 23:30。

## 本地命令

```bash
npm install
npm test
npm run lint
npm run build
```

本地验证静态页：

```bash
python3 -m http.server 4173 --directory github-pages
```

然后打开 `http://127.0.0.1:4173/`。

如果本地环境设置了 `WEREAD_API_KEY`，可以手动导出一次最新数据：

```bash
npm run pages:export
```

## 数据安全

- `WEREAD_API_KEY` 只存 GitHub Actions Secret。
- 前端页面不会保存或请求微信读书密钥。
- 同步脚本遇到微信读书 `upgrade_info` 会失败退出，不写入半成品数据。
- GitHub Pages 静态站不能安全触发即时同步；需要立即同步时手动运行 GitHub Actions workflow。

## 仍保留的 Sites 代码

仓库中仍保留之前的 Sites/D1 实现，方便回看或回滚旧版本；GitHub Pages workflow 不再调用这些接口。真正用于 GitHub Pages 发布的是 `github-pages/` 和 `scripts/export-weread-data.mjs`。
