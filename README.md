# HackerNews Daily

每日自动获取 HackerNews 热门文章，使用 AI 翻译和摘要，发布到 GitHub 和 Telegram。

## 技术栈

- **爬虫**: [Jina.ai Reader API](https://jina.ai/reader/) (500 RPM)
- **LLM**: [DeepSeek](https://deepseek.com/) (翻译和摘要)
- **发布**: GitHub + Telegram

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
# Jina.ai API Key（必填）
JINA_API_KEY=your-jina-api-key

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

### 4. 编译

```bash
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
│   ├── articleFetcher/ # Jina.ai 爬虫
│   ├── llm/           # DeepSeek LLM
│   ├── translator/    # 翻译服务
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

- **Jina.ai**: https://jina.ai/reader/ (免费 500 RPM)
- **DeepSeek**: https://platform.deepseek.com/ (新用户送额度)
- **GitHub Token**: https://github.com/settings/tokens (需要 repo 权限)

## License

MIT
