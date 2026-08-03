# HackerNews Daily

每日自动获取 HackerNews 热门文章和评论，使用 DeepSeek 读取外链、翻译和摘要，发布到 GitHub 和 Telegram。

## 技术栈

- **数据源**: Hacker News Algolia API（热门文章和评论）
- **LLM**: DeepSeek `deepseek-v4-flash`（外链读取、翻译和摘要）
- **发布**: GitHub + Telegram

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
# DeepSeek API Key（必填）
LLM_DEEPSEEK_API_KEY=your-deepseek-api-key

# GitHub 配置（必填）
GITHUB_TOKEN=your-github-token
TARGET_REPO=your-username/your-repo
TARGET_BRANCH=main

# Telegram 配置（可选）
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHANNEL_ID=@your-channel

# 可选配置
HN_STORY_LIMIT=30
SUMMARY_MAX_LENGTH=300
```

### 3. 本地运行

```bash
npm run dev
```

发布前查看完整的结构化数据和最终 Markdown（不会调用 GitHub 或 Telegram）：

```bash
HN_STORY_LIMIT=1 npm run preview
```

去掉 `HN_STORY_LIMIT=1` 即按 `.env` 中的配置数量生成完整预览。

### 4. 编译

```bash
npm test
npm run build
npm start
```

## 部署

详见 [deploy/README.md](deploy/README.md)

支持两种方式：

- 原生 Node.js + cron：不需要 Docker。
- Docker + cron：适合隔离运行环境。

### 原生 Node.js

```bash
cp deploy/.env.example .env
npm ci
npm run build
npm start
```

### Docker

```bash
cp deploy/.env.example .env
npm run build
docker build -f deploy/Dockerfile -t hackernews-daily .
docker run --rm \
  --env-file .env \
  hackernews-daily
```

## 项目结构

```
src/
├── api/
│   └── hackernews/     # Algolia HN API
├── services/
│   ├── llm/           # DeepSeek Responses API
│   ├── translator/    # 外链读取、翻译和摘要
│   └── markdownExporter.ts
├── scripts/
│   └── daily-export-simple.ts  # 主脚本
├── utils/
│   ├── date.ts
│   └── fetch.ts
└── types/
    └── index.ts
```

## 获取 API Key

- **DeepSeek**: https://platform.deepseek.com/ (新用户送额度)
- **GitHub Token**: https://github.com/settings/tokens (需要 repo 权限)

## 外链读取降级

外链内容通过 DeepSeek Responses API 的 Web Search 读取。帖子没有外链、DeepSeek 无法读取网页或 API 请求失败时，任务不会中断；对应文章会保留完整标题和链接，并在描述中显示无法获取内容的原因。

## License

MIT
