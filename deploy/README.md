# 部署指南

本项目不是常驻服务。`npm start` 和 Docker 容器都会执行一次每日导出，然后退出；定时运行交给 `cron`。

推荐配置：2 核 2GB 以上服务器。下面示例统一使用 `/opt/hackernews-daily` 作为项目目录，如使用其他目录，请同步替换命令里的路径。

## 部署方式

- 原生 Node.js + cron：适合不使用 Docker 的服务器。
- Docker + cron：适合希望隔离运行环境的服务器。

## 1. 准备环境变量

在项目根目录创建 `.env`：

```bash
cd /opt/hackernews-daily
cp deploy/.env.example .env
vi .env
```

先手动执行一次，确认 API Key 和目标仓库配置正确，再配置定时任务。

## 2. 原生 Node.js 部署

服务器需要 Node.js 20+ 和 npm。

```bash
cd /opt/hackernews-daily
npm ci
npm run build
npm start
```

如果本地开发机和服务器不是同一台机器，可以把仓库上传或 `git clone` 到 `/opt/hackernews-daily` 后再执行上述命令。

## 3. Docker 部署

Dockerfile 只复制已经编译好的 `dist/`，所以构建镜像前必须先编译。

```bash
cd /opt/hackernews-daily
npm ci
npm run build
docker build -f deploy/Dockerfile -t hackernews-daily:latest .

# 测试执行
docker run --rm --env-file .env hackernews-daily:latest
```

也可以使用 Docker Compose 执行一次任务：

```bash
docker compose -f deploy/docker-compose.yml run --rm hackernews-daily
```

## 4. 配置 cron 定时任务

先创建日志目录。cron 的重定向目标目录不存在时，shell 会在启动任务前失败，脚本本身不会执行。

```bash
mkdir -p /opt/hackernews-daily/logs
touch /opt/hackernews-daily/logs/hackernews-daily.log
```

确认命令路径，cron 不一定加载交互式 shell 的 `PATH`：

```bash
command -v npm
command -v node
command -v docker
```

编辑当前用户的 crontab：

```bash
crontab -e
```

如果 Node.js 通过 nvs、nvm 等用户级工具安装，建议在 crontab 顶部显式设置包含 `node` 和 `npm` 的 `PATH`，否则 cron 里可能找不到 `node`：

```cron
PATH=/path/to/node-bin:/usr/local/bin:/usr/bin:/bin
```

也可以直接使用 `command -v npm` 输出的绝对路径，例如 `/home/ubuntu/.nvs/default/bin/npm`。

原生 Node.js 示例，每天早晨 8 点执行：

```cron
0 8 * * * mkdir -p /opt/hackernews-daily/logs && cd /opt/hackernews-daily && /usr/local/bin/npm start >> /opt/hackernews-daily/logs/hackernews-daily.log 2>&1
```

Docker 示例：

```cron
0 8 * * * mkdir -p /opt/hackernews-daily/logs && cd /opt/hackernews-daily && /usr/bin/docker run --rm --env-file .env hackernews-daily:latest >> /opt/hackernews-daily/logs/hackernews-daily.log 2>&1
```

如果 `command -v npm` 或 `command -v docker` 输出的路径不同，请使用实际路径替换示例里的 `/usr/local/bin/npm` 或 `/usr/bin/docker`。

查看已安装任务：

```bash
crontab -l
```

## 5. 手动验证 cron 命令

验证时直接手动执行 crontab 里的同一条命令，并查看同一个日志文件。

原生 Node.js：

```bash
mkdir -p /opt/hackernews-daily/logs && cd /opt/hackernews-daily && /usr/local/bin/npm start >> /opt/hackernews-daily/logs/hackernews-daily.log 2>&1
tail -f /opt/hackernews-daily/logs/hackernews-daily.log
```

Docker：

```bash
mkdir -p /opt/hackernews-daily/logs && cd /opt/hackernews-daily && /usr/bin/docker run --rm --env-file .env hackernews-daily:latest >> /opt/hackernews-daily/logs/hackernews-daily.log 2>&1
tail -f /opt/hackernews-daily/logs/hackernews-daily.log
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `JINA_API_KEY` | ✅ | Jina.ai Reader API Key |
| `LLM_DEEPSEEK_API_KEY` | ✅ | DeepSeek API Key |
| `GITHUB_TOKEN` | ✅ | GitHub Personal Access Token |
| `TARGET_REPO` | ✅ | 目标仓库 (owner/repo) |
| `TARGET_BRANCH` | ❌ | 分支 (默认 main) |
| `TELEGRAM_ENABLED` | ❌ | 是否启用 Telegram |
| `TELEGRAM_BOT_TOKEN` | ❌ | Telegram Bot Token |
| `TELEGRAM_CHANNEL_ID` | ❌ | Telegram Channel ID |

## 获取 API Key

- **Jina.ai**: https://jina.ai/reader/ (免费 500 RPM)
- **DeepSeek**: https://platform.deepseek.com/
- **GitHub Token**: https://github.com/settings/tokens (repo 权限)

## 故障排查

```bash
# 查看日志
tail -f /opt/hackernews-daily/logs/hackernews-daily.log

# 手动执行测试（原生 Node.js）
npm start

# 手动执行测试（Docker）
docker run --rm --env-file .env hackernews-daily:latest

# 检查 cron 是否写入
crontab -l
```

## 更新服务

### 原生 Node.js

```bash
cd /opt/hackernews-daily
git pull
npm ci
npm run build
npm start
```

### Docker

```bash
cd /opt/hackernews-daily
git pull
npm ci
npm run build
docker build -f deploy/Dockerfile -t hackernews-daily:latest .
docker run --rm --env-file .env hackernews-daily:latest
```
