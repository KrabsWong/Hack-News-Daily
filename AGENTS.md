# 项目说明

HackerNews Daily - 每日自动获取 HackerNews 热门文章，使用 AI 翻译和摘要。

## 技术栈

- 数据源: Hacker News Algolia API（热门文章和评论）
- LLM: DeepSeek V4 Flash（外链读取、翻译和摘要）
- 发布: GitHub + Telegram

## 命令

```bash
npm run build     # 编译 TypeScript
npm run dev       # 本地开发运行
npm run start     # 运行编译后的代码
npm run typecheck # 类型检查
```

## 部署

详见 `deploy/README.md`

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `LLM_DEEPSEEK_API_KEY` | ✅ | DeepSeek API Key（外链读取、翻译和摘要） |
| `GITHUB_TOKEN` | ✅ | GitHub Token (repo 权限) |
| `TARGET_REPO` | ✅ | 目标仓库 (owner/repo) |
| `HN_TARGET_DATE` | ❌ | 指定补跑日期 (YYYY-MM-DD) |
| `TELEGRAM_ENABLED` | ❌ | 是否启用 Telegram |
| `TELEGRAM_BOT_TOKEN` | ❌ | Telegram Bot Token |
| `TELEGRAM_CHANNEL_ID` | ❌ | Telegram Channel ID |
