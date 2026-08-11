
<p align="center">
  <a href="https://sim.ai" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Sim-sim.ai-3B3B3B?labelColor=1A1A1A" alt="Sim.ai"></a>
  <a href="https://docs.sim.ai" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Docs-Read-E6E6E6?labelColor=C3C3C3&color=E6E6E6" alt="Documentation"></a>
  <a href="https://discord.gg/Hr4UWYEcTT" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Discord-Join-E6E6E6?logo=discord&logoColor=1A1A1A&labelColor=C3C3C3&color=E6E6E6" alt="Discord"></a>
  <a href="https://x.com/simdotai" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/X-%40simdotai-525252?logo=x&logoColor=white&labelColor=1A1A1A" alt="X"></a>
</p>

<p align="center">
  <a href="https://sim.ai" target="_blank" rel="noopener noreferrer">
    <img src="apps/sim/public/static/readme-banner.png" alt="Sim — 构建、部署和管理 AI Agent 与工作流" width="100%"/>
  </a>
</p>

<p align="center">构建、部署和管理 AI Agent 与工作流的统一工作空间。</p>

## 快速开始

### 云托管版：[sim.ai](https://sim.ai)

<a href="https://sim.ai" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Open-sim.ai-3B3B3B?labelColor=1A1A1A" alt="Open sim.ai"></a>

### 自托管版（本地构建 + Docker Compose）

```bash
git clone https://github.com/simstudioai/sim.git && cd sim

# 1. 本地构建全部服务镜像（app / copilot / db / pii / realtime，默认 tag=latest）
./scripts/build-images.sh

# 2. 启动（自动构建并运行 db + migrations + realtime + simstudio，含开发默认密钥）
docker compose -f docker-compose.local.yml up -d
```

打开 [http://localhost:3000](http://localhost:3000)

生产级构建与运行（`docker-compose.prod.yml`）的完整流程见下方 [自托管部署](#自托管部署)。不想本地构建时，也可用官方预构建镜像一键运行：`npx simstudio`（需安装并运行 Docker）。

## 核心能力

- 接入 1,000+ 第三方集成与所有主流大模型
- 支持 Slack、Notion、HubSpot、Salesforce、数据库等
- 可视化、对话式或代码方式构建 Agent
- 摄入文件、知识库与结构化表格数据
- 监控运行、日志、调度与工作流活动

## 一个工作空间，覆盖所有场景

<p align="center">对话与工作流只是起点 —— 表格、文件、知识库、定时任务都在同一个工作空间中。</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="apps/sim/public/static/readme-tables.png" alt="Sim 中的表格 — Agent 可查询的结构化数据" width="100%"/>
      <p align="center"><b>表格</b> — 内置数据库</p>
    </td>
    <td width="50%" valign="top">
      <img src="apps/sim/public/static/readme-files.png" alt="Sim 中的文件 — 团队与 Agent 共用的文档存储" width="100%"/>
      <p align="center"><b>文件</b> — 团队与每个 Agent 共用的存储</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="apps/sim/public/static/readme-knowledge.png" alt="Sim 中的知识库 — Agent 可搜索的同步文档" width="100%"/>
      <p align="center"><b>知识库</b> — Agent 的记忆</p>
    </td>
    <td width="50%" valign="top">
      <img src="apps/sim/public/static/readme-scheduled-tasks.png" alt="Sim 中的定时任务 — 按日历周期性运行的 Agent" width="100%"/>
      <p align="center"><b>定时任务</b> — 按你的节奏运行</p>
    </td>
  </tr>
</table>

## 自托管部署

### Docker Compose（本地构建 + 运行）

#### 1. 构建镜像

构建脚本 `scripts/build-images.sh` 负责本地编译全部服务镜像（也可只构建部分服务）：

```bash
# 构建全部服务：app / copilot / db / pii / realtime，tag 默认 latest
./scripts/build-images.sh

# 常用选项
./scripts/build-images.sh -r ghcr.io/simstudioai -t v1.0.0   # 指定镜像前缀与 tag
./scripts/build-images.sh app realtime                       # 只构建指定服务
./scripts/build-images.sh -p -r ghcr.io/simstudioai          # 构建并推送到私有仓库
./scripts/build-images.sh --platform linux/amd64,linux/arm64 # 交叉构建
```

构建产物默认命名 `{registry}simstudioai/{service}:{tag}`（如 `simstudioai/simstudio:latest`），支持 `-r/--registry`、`-t/--tag`（默认 `latest`）、`-p/--push`、`-n/--no-cache`、`--platform`。

#### 2. 配置 `.env` 并启动

创建 `.env`，至少设置三个密钥：

```bash
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" > .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "INTERNAL_API_SECRET=$(openssl rand -hex 32)" >> .env
echo "NEXT_PUBLIC_APP_URL=http://localhost:3000" >> .env
# 其余可选变量（OLLAMA_URL、REDIS_URL、各 LLM/存储密钥等）见下方"环境变量参考"
```

启动（本地构建的镜像）：

```bash
COPILOT_IMAGE=ghcr.io/simstudioai/copilot:latest docker compose -f docker-compose.prod.yml up -d
```

打开 [http://localhost:3000](http://localhost:3000)

> **镜像名对齐说明**：`docker-compose.prod.yml` 默认引用 `ghcr.io/simstudioai/*:latest`（copilot 例外，默认 `simstudio/copilot:latest`）。因此本地构建时使用 `-r ghcr.io/simstudioai` 即可与 compose 对齐，copilot 服务通过 `COPILOT_IMAGE` 环境变量覆盖。若构建时未指定 `-r`（产物为 `simstudioai/*:latest`），需自行 `docker tag` 或修改 compose 中的 image 引用。

#### 3. 本地开发/快速验证

`docker-compose.local.yml` 使用开发配置（`NODE_ENV=development`、内置开发默认密钥），无需先运行构建脚本——`docker compose` 会直接调用本地 Dockerfile 构建并启动 `db + migrations + realtime + simstudio`：

```bash
docker compose -f docker-compose.local.yml up -d
```

#### 4. 本地模型（Ollama）

`docker-compose.ollama.yml` 同样本地构建，`--profile setup` 会自动拉取推荐入门模型 `gemma3:4b`：

```bash
docker compose -f docker-compose.ollama.yml --profile setup up -d
```

Sim 也支持通过 [vLLM](https://docs.vllm.ai/) 使用本地模型。

### 手动部署

**环境要求：** [Bun](https://bun.sh/)、[Node.js](https://nodejs.org/) v20+、PostgreSQL 12+（带 [pgvector](https://github.com/pgvector/pgvector)）

1. 克隆并安装依赖：

```bash
git clone https://github.com/simstudioai/sim.git
cd sim
bun install
bun run prepare  # 安装 pre-commit hooks
```

2. 启动 PostgreSQL（含 pgvector）：

```bash
docker run --name simstudio-db -e POSTGRES_PASSWORD=your_password -e POSTGRES_DB=simstudio -p 5432:5432 -d pgvector/pgvector:pg17
```

3. 配置环境变量：

```bash
cp apps/sim/.env.example apps/sim/.env
# 生成三个密钥
perl -i -pe "s/your_encryption_key/$(openssl rand -hex 32)/" apps/sim/.env
perl -i -pe "s/your_internal_api_secret/$(openssl rand -hex 32)/" apps/sim/.env
perl -i -pe "s/your_api_encryption_key/$(openssl rand -hex 32)/" apps/sim/.env
cp packages/db/.env.example packages/db/.env
# 在两个 .env 中设置 DATABASE_URL="postgresql://postgres:your_password@localhost:5432/simstudio"
# 建议同时准备 apps/realtime/.env（需与 apps/sim/.env 共享多个值，见下文"变量关联关系"）
```

4. 执行数据库迁移：

```bash
cd packages/db && bun run db:migrate
```

5. 启动开发服务器：

```bash
bun run dev:full  # 同时启动 Next.js 应用与 realtime socket 服务
```

或分开运行：`bun run dev`（Next.js）与 `cd apps/sim && bun run dev:sockets`（realtime）。

## 环境变量参考

> 本文档完整覆盖部署涉及的全部环境变量。权威 schema 位于 `apps/sim/lib/core/config/env.ts`（`@t3-oss/env-nextjs` + Zod，`skipValidation: true`）、`apps/realtime/src/env.ts`。以下表格以部署用途分组。

### 部署拓扑与变量关联总览

自托管部署由以下进程组成，**每个进程从独立的环境读取变量**：

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  apps/sim (Next.js :3000)│        │  apps/realtime (Bun :3002)│
│  apps/sim/.env           │◄──────►│  apps/realtime/.env       │
│  · DATABASE_URL          │ 共享   │  · DATABASE_URL           │
│  · BETTER_AUTH_SECRET    │ 密钥   │  · BETTER_AUTH_SECRET     │
│  · BETTER_AUTH_URL       │        │  · BETTER_AUTH_URL        │
│  · INTERNAL_API_SECRET   │        │  · INTERNAL_API_SECRET    │
│  · NEXT_PUBLIC_APP_URL   │        │  · NEXT_PUBLIC_APP_URL    │
└──────────┬───────────────┘        └──────────┬───────────────┘
           │ DATABASE_URL（与 packages/db/.env 一致）
           ▼                                   ▼
┌──────────────────────────────────────────────────────────────┐
│          PostgreSQL + pgvector（Docker 服务 db:5432）          │
└──────────────────────────────────────────────────────────────┘
```

**核心关联关系（部署前必须理解）：**

| 关联项 | 要求 |
|---|---|
| `DATABASE_URL` | **三个文件必须一致**：`apps/sim/.env`、`apps/realtime/.env`、`packages/db/.env`。迁移脚本始终连主库，`packages/db/.env` 不要设置 replica URL |
| `BETTER_AUTH_SECRET` | `apps/sim` 与 `apps/realtime` **必须相同**（Better Auth "共享数据库会话"模式，两个进程共用同一张 session 表签名） |
| `BETTER_AUTH_URL` | 两个进程一致；必须填**公网可达**的应用地址。Docker Compose 中默认取 `NEXT_PUBLIC_APP_URL` 的值 |
| `INTERNAL_API_SECRET` | `apps/sim` 与 `apps/realtime` **必须相同**（realtime 回调 sim 内部 API 的鉴权密钥） |
| `NEXT_PUBLIC_APP_URL` | 两个进程一致；浏览器与 SSR 均使用 |
| `ENCRYPTION_KEY` | 只属于 `apps/sim`。用 AES-256-GCM 加密数据库中存储的敏感值（环境变量、密钥等）。**更换后旧密文无法解密**，请妥善保管。必须是 64 位十六进制字符串（32 字节） |
| `API_ENCRYPTION_KEY` | 只属于 `apps/sim`。独立密钥，用于加密用户保存的 API Key（未设置时 OSS 版可省略） |
| 前后端开关配对 | 大量自托管功能开关是**成对**的：服务端 `X_ENABLED` + 浏览器端 `NEXT_PUBLIC_X_ENABLED`（如 `ACCESS_CONTROL_ENABLED` / `NEXT_PUBLIC_ACCESS_CONTROL_ENABLED`），两端都要设置才能完整生效 |
| `NEXT_PUBLIC_*` 前缀 | 会被打包并注入浏览器（`window.__ENV`），**绝不能放密钥信息** |

### 必填变量（无默认值，不设置则启动失败或功能不可用）

| 变量 | 作用 | 生成方式 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接串（需 pgvector 扩展） | `postgresql://user:pass@host:5432/simstudio` |
| `BETTER_AUTH_SECRET` | 认证会话 JWT 签名密钥 | `openssl rand -hex 32`（≥32 字符） |
| `BETTER_AUTH_URL` | Better Auth 服务基础地址（公网可达） | 默认取 `NEXT_PUBLIC_APP_URL`（Compose） |
| `NEXT_PUBLIC_APP_URL` | 应用公网地址，如 `https://sim.example.com` | — |
| `ENCRYPTION_KEY` | 敏感数据加密密钥（64 位 hex = 32 字节） | `openssl rand -hex 32` |
| `INTERNAL_API_SECRET` | 内部 API / RPC 鉴权 | `openssl rand -hex 32`（≥32 字符） |

> `DISABLE_AUTH=true` 时，认证相关必填项（`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`）可省略——所有请求自动使用匿名会话。**仅限可信内网使用。**

### 数据库

| 变量 | 作用 | 默认值 |
|---|---|---|
| `DATABASE_URL` | 主库连接串（必填） | — |
| `DATABASE_REPLICA_URL` | 只读副本连接串，卸载日志/审计/看板聚合等重读路径；未设置时回退主库 | 空 |
| `SIM_DB_ROLE` | 进程池角色：`web` / `trigger` / `realtime`，配合下述 per-role 覆盖 | 空（按进程推断） |
| `DATABASE_URL_WEB` / `_TRIGGER` / `_REALTIME` | 各角色的主库 URL 覆盖，未设置回退 `DATABASE_URL` | 空 |
| `DATABASE_REPLICA_URL_WEB` / `_TRIGGER` / `_REALTIME` | 各角色的副本 URL 覆盖，回退 `DATABASE_REPLICA_URL` | 空 |
| `DB_APP_NAME` | PostgreSQL `application_name` 查询归属标记 | 空 |
| `DB_TX_TRIPWIRE` | 事务边界探测：`off` / `warn` / `throw` | 生产 `warn`，其他 `throw` |
| `MIGRATION_DATABASE_URL` | 迁移专用直连 DSN（PgBouncer 事务池场景必需；回退 `DATABASE_URL`） | 空 |
| `POSTGRES_URL` | 部分 db 脚本（backfill/migrate 等）的备选连接串 | 空 |
| `ALLOW_PRIVATE_DATABASE_HOSTS` | 允许数据库/连接器工具访问内网/保留/回环地址（放宽 SSRF 边界，仅可信内网） | 未设置（关闭） |

### 认证与登录

| 变量 | 作用 | 默认值 |
|---|---|---|
| `DISABLE_AUTH` | 完全绕过认证（匿名会话，仅限自托管内网） | 未设置 |
| `DISABLE_REGISTRATION` | 禁止新用户注册 | 未设置 |
| `EMAIL_PASSWORD_SIGNUP_ENABLED` | 服务端：启用邮箱+密码注册 | `true` |
| `NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED` | 浏览器端：显示邮箱/密码登录表单 | `true` |
| `DISABLE_EMAIL_SIGNUP` | 仅封禁邮箱+密码注册，保留登录 | 未设置 |
| `ALLOWED_LOGIN_EMAILS` | 允许登录的邮箱白名单（逗号分隔） | 空 |
| `ALLOWED_LOGIN_DOMAINS` | 允许登录的邮箱域名白名单（逗号分隔） | 空 |
| `BLOCKED_SIGNUP_DOMAINS` | 禁止注册的邮箱域名（如 `gmail.com,yahoo.com`） | 空 |
| `BLOCKED_EMAILS` | 封禁的具体邮箱（注册、登录、执行） | 空 |
| `SIGNUP_MX_VALIDATION_ENABLED` | 注册时校验邮箱 MX 记录（拦截一次性域名） | 未设置 |
| `BLOCKED_EMAIL_MX_HOSTS` | MX 主机黑名单子串（配合上项） | 空 |
| `TRUSTED_ORIGINS` | 额外信任的公网源（逗号分隔，apex+www/别名域名），合并进 Better Auth `trustedOrigins` | 空 |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile 人机校验服务端密钥 | 空 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile 前端 site key（与上项成对） | 空 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 登录 | 空 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth 登录 | 空 |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth 登录 | 空 |
| `DISABLE_GOOGLE_AUTH` / `DISABLE_GITHUB_AUTH` / `DISABLE_MICROSOFT_AUTH` | 即使配置了凭据也禁用对应 OAuth 登录 | 未设置 |

### 安全与加密

| 变量 | 作用 | 默认值 |
|---|---|---|
| `ENCRYPTION_KEY` | AES-256-GCM 加密密钥（必填，64 位 hex） | — |
| `API_ENCRYPTION_KEY` | 加密用户 API Key 的独立密钥 | 空（OSS 可省略） |
| `INTERNAL_API_SECRET` | 内部 API / RPC 鉴权（必填，≥32 字符） | — |
| `INTERNAL_JWT_SECRET` | 内部 JWT 专用签名密钥（隔离泄漏面） | 回退 `INTERNAL_API_SECRET` |
| `ADMIN_API_KEY` | 管理 API（GitOps 工作流导入导出）鉴权，请求头 `x-admin-key` | 空 |
| `CRON_SECRET` | 定时任务回调鉴权 | 空 |
| `MOTHERSHIP_API_ADMIN_KEY` | 母舰（copilot）管理端点管理密钥 | 空 |

### Redis

| 变量 | 作用 | 默认值 |
|---|---|---|
| `REDIS_URL` | 会话/缓存/限流/Copilot SSE 缓冲。单实例可省略（内存兜底），多副本必须设置 | Compose：`redis://redis:6379`；本地：空 |
| `REDIS_TLS_SERVERNAME` | `rediss://` 指向 IP 时的 TLS SNI 覆盖（如 Trigger.dev PrivateLink） | 空 |

### 对象存储（文件上传）

**默认使用本地磁盘。** 生产建议配置 S3 或 Azure Blob。

| 变量 | 作用 | 默认值 |
|---|---|---|
| `AWS_REGION` | 区域；配合 `S3_BUCKET_NAME` 启用 S3。Cloudflare R2 填 `auto` | 空 |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 凭据；省略时走实例/IRSA 凭证链 | 空 |
| `S3_BUCKET_NAME` | 通用工作区文件桶 | 空 |
| `S3_KB_BUCKET_NAME` | 知识库文档桶 | 空 |
| `S3_EXECUTION_FILES_BUCKET_NAME` | 工作流执行文件桶 | 空 |
| `S3_CHAT_BUCKET_NAME` | 已部署 Chat 资源桶 | 空 |
| `S3_COPILOT_BUCKET_NAME` | Copilot 附件桶 | 空 |
| `S3_PROFILE_PICTURES_BUCKET_NAME` | 用户头像桶 | 空 |
| `S3_OG_IMAGES_BUCKET_NAME` | OpenGraph 预览图桶 | 回退 `S3_BUCKET_NAME` |
| `S3_WORKSPACE_LOGOS_BUCKET_NAME` | 工作区 Logo 桶 | 回退 `S3_BUCKET_NAME` |
| `S3_LOGS_BUCKET_NAME` | 日志桶 | 空 |
| `S3_ENDPOINT` | S3 兼容存储自定义端点（R2 / MinIO / B2） | 空（AWS S3） |
| `S3_FORCE_PATH_STYLE` | 强制 path-style（MinIO/Ceph RGW 必需） | 未设置（AWS/R2 不需要） |
| `AZURE_ACCOUNT_NAME` / `AZURE_ACCOUNT_KEY` / `AZURE_CONNECTION_STRING` | Azure Blob 凭据 | 空 |
| `AZURE_STORAGE_CONTAINER_NAME` | Azure 通用容器 | 空 |
| `AZURE_STORAGE_KB_CONTAINER_NAME` | Azure 知识库容器 | 空 |
| `AZURE_STORAGE_EXECUTION_FILES_CONTAINER_NAME` | Azure 执行文件容器 | 空 |
| `AZURE_STORAGE_CHAT_CONTAINER_NAME` / `_COPILOT_` / `_PROFILE_PICTURES_` / `_OG_IMAGES_` / `_WORKSPACE_LOGOS_` | 与 S3 各桶对应的 Azure 容器 | 空 |

### 邮件发送

**只配置一个提供商**，自动按优先级探测：Resend → AWS SES → SMTP → Azure ACS。全部未配置时邮件只写入日志。

| 变量 | 作用 | 默认值 |
|---|---|---|
| `RESEND_API_KEY` | Resend API key | 空 |
| `AWS_SES_REGION` | SES 区域（凭据走 AWS 标准链） | 空 |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | SMTP 服务器（USER/PASS 可省略走无认证中继） | 空 |
| `SMTP_PORT` | SMTP 端口：465=隐式 TLS、587=STARTTLS、25=明文 | 空 |
| `SMTP_SECURE` | 强制 TLS 连接；端口 465 自动开启 | 自动 |
| `AZURE_ACS_CONNECTION_STRING` | Azure Communication Services 连接串 | 空 |
| `FROM_EMAIL_ADDRESS` | 发件人地址，如 `"Sim <noreply@example.com>"` | 空 |
| `EMAIL_DOMAIN` | `FROM_EMAIL_ADDRESS` 未设置时的回退域名 | 空 |
| `PERSONAL_EMAIL_FROM` | 个性化邮件发件地址 | 空 |
| `EMAIL_VERIFICATION_ENABLED` | 注册/登录邮箱验证 | 未设置 |

### 短信

| 变量 | 作用 | 默认值 |
|---|---|---|
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Twilio SMS 发送 | 空 |

### AI / LLM 提供商

| 变量 | 作用 | 默认值 |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI 主密钥；另有 `OPENAI_API_KEY_1/2/3` 轮换 | 空 |
| `ANTHROPIC_API_KEY_1` / `_2` / `_3` | Anthropic Claude 轮换密钥 | 空 |
| `GEMINI_API_KEY` | Gemini 单密钥（轮换未设置时回退） | 空 |
| `GEMINI_API_KEY_1` / `_2` / `_3` | Gemini 轮换密钥 | 空 |
| `MISTRAL_API_KEY` | Mistral API key | 空 |
| `COHERE_API_KEY` | Knowledge 块 reranker（rerank-v4.0-pro/-fast、v3.5） | 空 |
| `COHERE_API_KEY_1` / `_2` / `_3` | Cohere 轮换密钥 | 空 |
| `NEXT_PUBLIC_COHERE_CONFIGURED` | 已预配 Cohere 时隐藏 Knowledge 块密钥输入框 | 空 |
| `ELEVENLABS_API_KEY` | 已部署 Chat 的 TTS | 空 |
| `SERPER_API_KEY` / `EXA_API_KEY` | 在线搜索 | 空 |
| `FIREWORKS_API_KEY` / `TOGETHER_API_KEY` / `BASETEN_API_KEY` | 模型列表/推理 | 空 |
| `BLACKLISTED_PROVIDERS` | 隐藏的提供商 ID（逗号分隔，如 `openai,anthropic`） | 空 |
| `BLACKLISTED_MODELS` | 隐藏的模型名/前缀（如 `gpt-4,claude-*`） | 空 |
| `ALLOWED_MCP_DOMAINS` | MCP 服务器域名白名单（逗号分隔；空 = 全部允许） | 空 |
| `ALLOWED_INTEGRATIONS` | 允许的块类型白名单（如 `slack,github,agent`；空 = 全部） | 空 |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_API_VERSION` | Azure OpenAI 共享凭据 | 空 |
| `AZURE_ANTHROPIC_ENDPOINT` / `AZURE_ANTHROPIC_API_KEY` / `AZURE_ANTHROPIC_API_VERSION` | Azure AI Foundry 上的 Anthropic | 空 |
| `NEXT_PUBLIC_AZURE_CONFIGURED` | 已预配 Azure 时隐藏 Agent 块的端点/密钥输入框 | 空 |
| `KB_EMBEDDING_MODEL` | 新建知识库的嵌入模型 | `text-embedding-3-small` |
| `KB_OPENAI_MODEL_NAME` | Azure 部署名（仅 Azure 凭据场景） | 空 |
| `OCR_AZURE_ENDPOINT` / `OCR_AZURE_MODEL_NAME` / `OCR_AZURE_API_KEY` | Azure Mistral OCR | 空 |
| `VERTEX_PROJECT` / `VERTEX_LOCATION` | Google Vertex AI | `us-central-1` |
| `NEXT_PUBLIC_BEDROCK_DEFAULT_CREDENTIALS` | 使用 AWS 默认凭证链（IAM/IRSA）时隐藏 Bedrock 凭据输入框 | 空 |
| `WAND_OPENAI_MODEL_NAME` | Wand 生成的 OpenAI 模型名 | 空 |

### 本地模型

| 变量 | 作用 | 默认值 |
|---|---|---|
| `OLLAMA_URL` | 本地 Ollama 服务地址 | Compose：`http://ollama:11434`（ollama 栈）或 `http://localhost:11434`；本地：空 |
| `VLLM_BASE_URL` / `VLLM_API_KEY` | 自托管 vLLM（OpenAI 兼容） | 空 |
| `LITELLM_BASE_URL` / `LITELLM_API_KEY` | LiteLLM 代理 | 空 |

### Hosted 工具密钥（Sim 代供密钥，用户无需自带）

每个提供商按 `{PREFIX}_COUNT` + `{PREFIX}_1..N` 读取，多把密钥轮询分发。

| 变量 | 作用 |
|---|---|
| `HUNTER_API_KEY_COUNT` / `HUNTER_API_KEY_1` / `HUNTER_API_KEY_2` | Hunter.io 托管密钥 |
| `PEOPLEDATALABS_API_KEY_COUNT` / `PEOPLEDATALABS_API_KEY_1` / `PEOPLEDATALABS_API_KEY_2` | People Data Labs 托管密钥 |
| `FALAI_API_KEY` | FAL AI（图片生成 / 视频生成工具） |
| `TRELLO_API_KEY` | Trello 全局 API key |
| `APOLLO_API_KEY` | Apollo 系统级配置 |
| `GITHUB_TOKEN` | GitHub 个人访问令牌（API 访问） |
| `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` | 浏览器自动化 |

### 三方 OAuth 集成（可选，配置后启用对应集成）

| 变量 | 作用 |
|---|---|
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Slack |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | Notion |
| `HUBSPOT_CLIENT_ID` / `HUBSPOT_CLIENT_SECRET` | HubSpot |
| `SALESFORCE_CLIENT_ID` / `SALESFORCE_CLIENT_SECRET` | Salesforce |
| `JIRA_CLIENT_ID` / `JIRA_CLIENT_SECRET`、`CONFLUENCE_CLIENT_ID` / `CONFLUENCE_CLIENT_SECRET` | Atlassian |
| `LINEAR_CLIENT_ID` / `LINEAR_CLIENT_SECRET` | Linear |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google 服务集成 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub 集成 |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Office 365 / Teams |
| `ASANA_CLIENT_ID` / `ASANA_CLIENT_SECRET` | Asana |
| `AIRTABLE_CLIENT_ID` / `AIRTABLE_CLIENT_SECRET` | Airtable |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | X (Twitter) |
| `MONDAY_CLIENT_ID` / `MONDAY_CLIENT_SECRET` | Monday.com |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord |
| `DOCUSIGN_CLIENT_ID` / `DOCUSIGN_CLIENT_SECRET` | DocuSign |
| `WEALTHBOX_CLIENT_ID` / `WEALTHBOX_CLIENT_SECRET` | WealthBox |
| `PIPEDRIVE_CLIENT_ID` / `PIPEDRIVE_CLIENT_SECRET` | Pipedrive |
| `BOX_CLIENT_ID` / `BOX_CLIENT_SECRET` | Box |
| `DROPBOX_CLIENT_ID` / `DROPBOX_CLIENT_SECRET` | Dropbox |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Reddit |
| `WEBFLOW_CLIENT_ID` / `WEBFLOW_CLIENT_SECRET` | Webflow |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | Shopify |
| `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` | Zoom |
| `WORDPRESS_CLIENT_ID` / `WORDPRESS_CLIENT_SECRET` | WordPress.com |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify |
| `CALCOM_CLIENT_ID` | Cal.com |
| `ATTIO_CLIENT_ID` / `ATTIO_CLIENT_SECRET` | Attio |
| `SUPABASE_CLIENT_ID` / `SUPABASE_CLIENT_SECRET` | Supabase OAuth |

### Copilot / Chat 服务

Sim 的 Chat 是独立托管服务（[sim.ai](https://sim.ai)）。自托管实例通过以下变量对接：

| 变量 | 作用 | 默认值 |
|---|---|---|
| `COPILOT_API_KEY` | 自托管 → Chat 服务的鉴权密钥（在 sim.ai → Settings → Chat keys 生成） | 空 |
| `SIM_AGENT_API_URL` | Chat 服务地址 | Compose：`http://copilot:3002`；代码回退 `https://www.copilot.sim.ai` |
| `COPILOT_SOURCE_ENV` | 上报母舰的环境标识：`dev` / `staging` / `prod` | 空 |
| `COPILOT_DEV_URL` / `COPILOT_STAGING_URL` / `COPILOT_PROD_URL` | 各环境母舰 URL | 空 |
| `AGENT_INDEXER_URL` / `AGENT_INDEXER_API_KEY` | Agent 训练数据索引器 | 空 |
| `COPILOT_STREAM_TTL_SECONDS` / `COPILOT_STREAM_EVENT_LIMIT` | Copilot SSE 缓冲 TTL / 最大事件数 | 空 |

### Wand（AI 生成，Agent 块/UI 生成）

密钥按 `WAND_LLM_API_KEY` → `DEEPSEEK_API_KEY` → `OPENAI_API_KEY` 的优先级解析。

| 变量 | 作用 | 默认值 |
|---|---|---|
| `WAND_LLM_API_KEY` / `WAND_LLM_BASE_URL` / `WAND_LLM_MODEL` | 自定义 LLM 生成 | 空 |
| `DEEPSEEK_API_KEY` | 启用 DeepSeek 生成 | 空（模型回退 `deepseek-v4-pro`，地址 `https://api.deepseek.com/v1`） |
| `OPENAI_API_KEY` | 启用 OpenAI 生成 | 空（模型回退 `gpt-4o`） |

### E2B 远程代码执行

| 变量 | 作用 | 默认值 |
|---|---|---|
| `E2B_ENABLED` | 启用 E2B 沙箱 | 空 |
| `NEXT_PUBLIC_E2B_ENABLED` | 浏览器端启用标识 | 空 |
| `E2B_API_KEY` | E2B 沙箱创建密钥（启用时必须） | 空 |
| `MOTHERSHIP_E2B_TEMPLATE_ID` | 预装 CLI 工具的 shell 执行模板 | 空 |
| `MOTHERSHIP_E2B_DOC_TEMPLATE_ID` | 文档生成专用模板（设置后文档编译走 Python 而非 isolated-vm） | 空 |
| `E2B_PI_TEMPLATE_ID` | Pi Coding Agent 云端模板 | 空 |

### SSO（OIDC / SAML）

通过 `packages/db` 下的 `register-sso-provider` 脚本注册（`SSO_PROVIDER_TYPE`、`SSO_PROVIDER_ID`、`SSO_ISSUER`、`SSO_DOMAIN` 为 OIDC/SAML 共同必填项）。

| 变量 | 作用 | 默认值 |
|---|---|---|
| `SSO_ENABLED` | 启用 SSO | 空 |
| `SSO_PROVIDER_TYPE` | 提供商类型：`oidc` / `saml`（必填） | 空 |
| `SSO_PROVIDER_ID` / `SSO_ISSUER` / `SSO_DOMAIN` | 提供商 ID / 签发者 / 邮箱域名（必填） | 空 |
| `SSO_ORGANIZATION_ID` | 注册到指定组织 | 空 |
| `SSO_TRUSTED_PROVIDER_IDS` | 信任的提供商 ID 列表（用于邮箱自动关联账号） | 空 |
| `NEXT_PUBLIC_SSO_ENABLED` | 浏览器端显示 SSO 登录 UI | 空 |
| `SSO_MAPPING_ID` / `SSO_MAPPING_EMAIL` / `SSO_MAPPING_NAME` / `SSO_MAPPING_IMAGE` | 属性映射 | OIDC：`sub`/`email`/`name`/`picture`；SAML：`nameidentifier`/`emailaddress`/`name` |
| `SSO_OIDC_CLIENT_ID` / `SSO_OIDC_CLIENT_SECRET` | OIDC 客户端凭据（OIDC 必填） | 空 |
| `SSO_OIDC_SCOPES` | OIDC scopes | `openid,profile,email` |
| `SSO_OIDC_PKCE` | 启用 PKCE | `true` |
| `SSO_OIDC_AUTHORIZATION_ENDPOINT` / `_TOKEN_` / `_USERINFO_` / `_JWKS_` | 各端点覆盖（省略走 discovery） | 空 |
| `SSO_OIDC_DISCOVERY_ENDPOINT` | discovery 端点 | `{issuer}/.well-known/openid-configuration` |
| `SSO_SAML_ENTRY_POINT` / `SSO_SAML_CERT` | SAML IdP SSO URL / 证书（SAML 必填） | 空 |
| `SSO_SAML_CALLBACK_URL` | SAML 回调 | `{issuer}/callback` |
| `SSO_SAML_SP_METADATA` / `SSO_SAML_IDP_METADATA` | SP / IdP 元数据 XML（SP 未提供则自动生成） | 空 |
| `SSO_SAML_AUDIENCE` | 受众限制 | `issuer` |
| `SSO_SAML_WANT_ASSERTIONS_SIGNED` | 要求断言签名 | `false` |
| `SSO_SAML_SIGNATURE_ALGORITHM` / `SSO_SAML_DIGEST_ALGORITHM` / `SSO_SAML_IDENTIFIER_FORMAT` | 签名/摘要算法、标识符格式 | 空 |

### 计费与用量限制（Stripe）

自托管默认不启用（`BILLING_ENABLED` 未设置时按免费额度执行）。

| 变量 | 作用 | 默认值 |
|---|---|---|
| `BILLING_ENABLED` | 启用计费强制与用量统计 | 空 |
| `NEXT_PUBLIC_BILLING_ENABLED` | 浏览器端计费 UI | 空 |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe 密钥 / webhook 签名 | 空 |
| `STRIPE_FREE_PRICE_ID` / `STRIPE_PRO_PRICE_ID` / `STRIPE_TEAM_PRICE_ID` / `STRIPE_ENTERPRISE_PRICE_ID` | 各档位 Stripe price ID | 空 |
| `STRIPE_PRICE_TIER_25_MO` / `_100_MO` / `_25_YR` / `_100_YR` | 积分档位价格（月付/年付） | 空 |
| `STRIPE_PRICE_TEAM_25_MO` / `_25_YR` / `_100_MO` / `_100_YR` | 团队席位价格 | 空 |
| `FREE_TIER_COST_LIMIT` / `PRO_TIER_COST_LIMIT` / `TEAM_TIER_COST_LIMIT` / `ENTERPRISE_TIER_COST_LIMIT` | 各档成本上限 | 空 |
| `FREE_STORAGE_LIMIT_GB` / `PRO_STORAGE_LIMIT_GB` / `TEAM_STORAGE_LIMIT_GB` / `ENTERPRISE_STORAGE_LIMIT_GB` | 各档存储上限（GB） | `5` / `50` / `500` / `500` |
| `OVERAGE_THRESHOLD_DOLLARS` | 超额计费阈值（美元） | `100` |
| `FREE_API_DEPLOYMENT_GATE_ENABLED` | 封禁免费档程序化执行（API/MCP/webhook/嵌入），需 `BILLING_ENABLED` | 未设置 |
| `FREE_TABLES_LIMIT` / `FREE_TABLE_ROWS_LIMIT` | 免费档表格数 / 行数上限 | `5` / `50000` |
| `PRO_TABLES_LIMIT` / `PRO_TABLE_ROWS_LIMIT` | Pro 档 | `100` / `100000` |
| `TEAM_TABLES_LIMIT` / `TEAM_TABLE_ROWS_LIMIT` | Team 档 | `1000` / `500000` |
| `ENTERPRISE_TABLES_LIMIT` / `ENTERPRISE_TABLE_ROWS_LIMIT` | Enterprise 档 | `10000` / `1000000` |
| `TABLE_MAX_ROW_SIZE_BYTES` | 单行最大序列化大小 | `409600` |
| `COST_MULTIPLIER` | 成本计算倍率 | 空 |

### 限流、超时与请求上限

| 变量 | 作用 | 默认值 |
|---|---|---|
| `ADMISSION_GATE_MAX_INFLIGHT` | 每 Pod 最大并发执行请求数 | `500` |
| `API_MAX_JSON_BODY_BYTES` | 契约路由最大 JSON 请求体 | `52428800`（50 MB） |
| `CHAT_MAX_REQUEST_BYTES` | 公开 Chat 端点请求体上限（15 个 base64 附件） | `230686720`（220 MB） |
| `WEBHOOK_MAX_REQUEST_BYTES` | Webhook 接收端点请求体上限 | `10485760`（10 MB） |
| `RATE_LIMIT_WINDOW_MS` | 限流窗口 | `60000` |
| `MANUAL_EXECUTION_LIMIT` | 手动执行豁免值（近无限） | `999999` |
| `RATE_LIMIT_FREE_SYNC` / `RATE_LIMIT_FREE_ASYNC` | 免费档同步/异步 API 执行每分钟 | `50` / `200` |
| `RATE_LIMIT_PRO_SYNC` / `RATE_LIMIT_PRO_ASYNC` | Pro 档 | `150` / `1000` |
| `RATE_LIMIT_TEAM_SYNC` / `RATE_LIMIT_TEAM_ASYNC` | Team 档 | `300` / `2500` |
| `RATE_LIMIT_ENTERPRISE_SYNC` / `RATE_LIMIT_ENTERPRISE_ASYNC` | Enterprise 档 | `600` / `5000` |
| `EXECUTION_TIMEOUT_FREE` / `_PRO` / `_TEAM` / `_ENTERPRISE` | 同步执行超时（秒） | `300` / `3000` / `3000` / `3000` |
| `EXECUTION_TIMEOUT_ASYNC_FREE` / `_PRO` / `_TEAM` / `_ENTERPRISE` | 异步执行超时（秒） | 均为 `5400` |

### isolated-vm 执行池（Code 块）

| 变量 | 作用 | 默认值 |
|---|---|---|
| `IVM_POOL_SIZE` | 最大 worker 进程数 | `4` |
| `IVM_MAX_CONCURRENT` | 全局最大并发执行 | `10000` |
| `IVM_MAX_PER_WORKER` | 单 worker 最大并发 | `2500` |
| `IVM_WORKER_IDLE_TIMEOUT_MS` | worker 空闲回收 | `60000` |
| `IVM_MAX_QUEUE_SIZE` | 内存中最大排队执行数 | `10000` |
| `IVM_MAX_FETCH_RESPONSE_BYTES` | 沙箱 fetch 响应字节上限 | `8388608` |
| `IVM_MAX_FETCH_RESPONSE_CHARS` | 沙箱 fetch 返回字符上限 | `4000000` |
| `IVM_MAX_FETCH_OPTIONS_JSON_CHARS` | fetch 选项 JSON 上限 | `262144` |
| `IVM_MAX_FETCH_URL_LENGTH` | fetch URL 长度上限 | `8192` |
| `IVM_MAX_STDOUT_CHARS` | 单次执行捕获 stdout 上限 | `200000` |
| `IVM_MAX_ACTIVE_PER_OWNER` | 单拥有者每进程最大活跃执行 | `200` |
| `IVM_MAX_QUEUED_PER_OWNER` | 单拥有者最大排队数 | `2000` |
| `IVM_MAX_OWNER_WEIGHT` | 加权调度权重上限 | `5` |
| `IVM_DISTRIBUTED_MAX_INFLIGHT_PER_OWNER` | 跨副本单拥有者最大 in-flight 租约 | `2200` |
| `IVM_DISTRIBUTED_LEASE_MIN_TTL_MS` | 分布式租约最小 TTL | `120000` |
| `IVM_QUEUE_TIMEOUT_MS` | 排队等待上限（超时拒绝） | `300000` |
| `IVM_MAX_EXECUTIONS_PER_WORKER` | worker 生命周期内最大执行数（触发回收） | `200` |
| `IVM_MAX_BROKER_ARGS_JSON_CHARS` | 沙箱任务 broker 参数上限 | `262144` |
| `IVM_MAX_BROKER_RESULT_JSON_CHARS` | broker 结果上限 | `16777216` |
| `IVM_MAX_BROKERS_PER_EXECUTION` | 单任务最大 broker 调用数 | `1000` |

### 知识库处理

| 变量 | 作用 | 默认值 |
|---|---|---|
| `KB_CONFIG_MAX_DURATION` | 最大处理时长（秒） | `600` |
| `KB_CONFIG_MAX_ATTEMPTS` | 最大重试次数 | `3` |
| `KB_CONFIG_RETRY_FACTOR` | 退避因子 | `2` |
| `KB_CONFIG_MIN_TIMEOUT` / `KB_CONFIG_MAX_TIMEOUT` | 最小/最大超时（ms） | `1000` / `10000` |
| `KB_CONFIG_CONCURRENCY_LIMIT` | 嵌入调用并发 | `50` |
| `KB_CONFIG_BATCH_SIZE` | 每批分块数 | `2000` |
| `KB_CONFIG_DELAY_BETWEEN_BATCHES` | 批次间延迟（0=全速） | `0` |
| `KB_CONFIG_DELAY_BETWEEN_DOCUMENTS` | 文档间延迟 | `50` |
| `KB_CONFIG_CHUNK_CONCURRENCY` | PDF 分块 OCR 并发 | `10` |

### Trigger.dev 后台任务与调度

| 变量 | 作用 | 默认值 |
|---|---|---|
| `TRIGGER_PROJECT_ID` / `TRIGGER_SECRET_KEY` | Trigger.dev 项目与密钥（自托管后台任务需要） | 空 |
| `TRIGGER_DEV_ENABLED` | 启用 Trigger.dev 异步任务 | 空 |
| `CRON_SECRET` | 定时任务鉴权 | 空 |
| `JOB_RETENTION_DAYS` | 任务日志保留天数 | `1` |
| `SCHEDULE_EXECUTION_CONCURRENCY_LIMIT` | 调度执行并发上限 | `30` |
| `WORKFLOW_EXECUTION_CONCURRENCY_LIMIT` | 工作流执行并发上限 | `75` |
| `WEBHOOK_EXECUTION_CONCURRENCY_LIMIT` | Webhook 执行并发上限 | `75` |
| `RESUME_EXECUTION_CONCURRENCY_LIMIT` | 恢复执行并发上限 | `50` |
| `SCHEDULE_ENQUEUE_BUDGET_MULTIPLIER` | 调度入队预算倍率 | `2` |
| `SCHEDULE_JITTER_MAX_MS` | 调度抖动上限 | `30000` |
| `SCHEDULE_INFRA_RETRY_BASE_MS` / `SCHEDULE_INFRA_RETRY_MAX_MS` / `SCHEDULE_INFRA_RETRY_MAX_ATTEMPTS` | 调度基础设施重试 | `60000` / `300000` / `10` |
| `TRIGGER_EU_REGION` | Trigger.dev 运行路由到 `eu-central-1` | 未设置 |
| `GRAFANA_OTLP_ENDPOINT` / `GRAFANA_OTLP_HEADERS` / `GRAFANA_DEPLOYMENT_ENVIRONMENT` | Trigger.dev 遥测出口（Grafana OTLP） | 空 |

### 遥测与监控

| 变量 | 作用 | 默认值 |
|---|---|---|
| `LOG_LEVEL` | 日志级别：`DEBUG` / `INFO` / `WARN` / `ERROR` | 生产 `ERROR`，开发 `DEBUG` |
| `TELEMETRY_ENDPOINT` | 自定义遥测端点 | 空 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP 出口端点（优先于 `TELEMETRY_ENDPOINT`） | 空 |
| `OTEL_EXPORTER_OTLP_HEADERS` | OTLP 请求头（`key=value` 逗号分隔） | 空 |
| `OTEL_TRACES_SAMPLER_ARG` / `TELEMETRY_SAMPLING_RATIO` | Trace 采样率 | 空 |
| `OTEL_DEPLOYMENT_ENVIRONMENT` / `DEPLOYMENT_ENVIRONMENT` / `APPCONFIG_ENVIRONMENT` | 部署环境标签（按序回退） | 空 |
| `NEXT_TELEMETRY_DISABLED` | 关闭 Next.js 遥测 | 空 |
| `NEXT_PUBLIC_POSTHOG_ENABLED` / `NEXT_PUBLIC_POSTHOG_KEY` | PostHog 前端分析 | 空 |
| `PROFOUND_API_KEY` / `PROFOUND_ENDPOINT` | Profound 分析 | 空 |
| `PII_URL` / `PII_MASK_CHUNK_CONCURRENCY` | Presidio PII 服务地址 / 掩码批并发 | `http://localhost:5001` / `4` |
| `PII_REDACTION` / `PII_GRANULAR_REDACTION` | PII 脱敏 / 执行内脱敏（Data Retention 配置） | 未设置 |

### 白标与品牌定制

| 变量 | 作用 | 默认值 |
|---|---|---|
| `NEXT_PUBLIC_WHITELABELING_ENABLED` | 启用白标（自托管） | 空 |
| `NEXT_PUBLIC_BRAND_NAME` | 品牌名 | `Sim` |
| `NEXT_PUBLIC_BRAND_LOGO_URL` / `NEXT_PUBLIC_BRAND_FAVICON_URL` | Logo / Favicon URL | 空 |
| `NEXT_PUBLIC_CUSTOM_CSS_URL` | 自定义样式表 | 空 |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | 支持邮箱 | 空 |
| `NEXT_PUBLIC_BRAND_PRIMARY_COLOR` / `NEXT_PUBLIC_BRAND_PRIMARY_HOVER_COLOR` | 主色/悬停色（hex） | 空 |
| `NEXT_PUBLIC_BRAND_ACCENT_COLOR` / `NEXT_PUBLIC_BRAND_ACCENT_HOVER_COLOR` | 强调色/悬停色（hex） | 空 |
| `NEXT_PUBLIC_BRAND_BACKGROUND_COLOR` | 背景色（hex） | 空 |
| `NEXT_PUBLIC_DOCUMENTATION_URL` / `NEXT_PUBLIC_TERMS_URL` / `NEXT_PUBLIC_PRIVACY_URL` | 文档/条款/隐私链接 | 空 |

### 自托管功能开关（服务端 + 浏览器端成对）

| 变量 | 作用 |
|---|---|
| `ACCESS_CONTROL_ENABLED` / `NEXT_PUBLIC_ACCESS_CONTROL_ENABLED` | 权限组（访问控制） |
| `AUDIT_LOGS_ENABLED` / `NEXT_PUBLIC_AUDIT_LOGS_ENABLED` | 审计日志 |
| `DATA_RETENTION_ENABLED` / `NEXT_PUBLIC_DATA_RETENTION_ENABLED` | 数据保留设置 |
| `DATA_DRAINS_ENABLED` / `NEXT_PUBLIC_DATA_DRAINS_ENABLED` | 数据导出（drains） |
| `FORKING_ENABLED` / `NEXT_PUBLIC_FORKING_ENABLED` | 工作区复制 |
| `ORGANIZATIONS_ENABLED` / `NEXT_PUBLIC_ORGANIZATIONS_ENABLED` | 组织 |
| `CREDENTIAL_SETS_ENABLED` / `NEXT_PUBLIC_CREDENTIAL_SETS_ENABLED` | 凭据集（邮箱轮询） |
| `INBOX_ENABLED` / `NEXT_PUBLIC_INBOX_ENABLED` | Sim Mailer 收件箱 |
| `DISABLE_INVITATIONS` / `NEXT_PUBLIC_DISABLE_INVITATIONS` | 全局禁用工作区邀请 |
| `DISABLE_PUBLIC_API` / `NEXT_PUBLIC_DISABLE_PUBLIC_API` | 全局禁用公共 API |
| `NEXT_PUBLIC_WORKFLOW_COLUMNS_ENABLED` | 表格中的"工作流"列类型 |
| `NEXT_PUBLIC_ENABLE_PLAYGROUND` | `/playground` 组件预览 |
| `NEXT_PUBLIC_COPILOT_TRAINING_ENABLED` | Copilot 训练数据入口 |
| `AGENTMAIL_API_KEY` / `AGENTMAIL_DOMAIN` | AgentMail 邮箱收件箱（默认域 `agentmail.to`） |
| `TABLES_FRACTIONAL_ORDERING` / `TABLE_SNAPSHOT_CACHE` | 表格排序 / 快照缓存优化 |
| `MOTHERSHIP_BETA_FEATURES` | 母舰 beta 功能 |

### Docker Compose 部署专用变量

以下变量只出现在 `.env`（Compose 读取），由 `docker-compose.prod.yml` 消费并映射给各服务：

| 变量 | 作用 | 默认值 |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | 数据库账号/密码/库名，同时参与构造各服务的 `DATABASE_URL` | `postgres` / `postgres` / `simstudio` |
| `POSTGRES_PORT` | 宿主机映射端口 | `5432` |
| `NEXT_PUBLIC_APP_URL` | 应用公网地址（同时作为 `BETTER_AUTH_URL` 默认值） | `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | 认证密钥（必填） | — |
| `ENCRYPTION_KEY` | 加密密钥（必填） | —（ollama 栈自动生成） |
| `API_ENCRYPTION_KEY` | API Key 加密密钥 | 空 |
| `INTERNAL_API_SECRET` | 内部 API 密钥（必填） | — |
| `TRUSTED_ORIGINS` | 额外信任源（多域名/反代场景） | 空 |
| `REDIS_URL` | Redis 地址 | `redis://redis:6379` |
| `SIM_AGENT_API_URL` | Chat 服务地址 | `http://copilot:3002` |
| `COPILOT_IMAGE` | Copilot 镜像 | `simstudio/copilot:latest` |
| `COPILOT_API_KEY` | 对接 Chat 服务密钥 | 空 |
| `COPILOT_LLM_PROVIDER` | Copilot 服务 LLM 提供商 | `deepseek` |
| `COPILOT_DEFAULT_MODEL` | Copilot 默认模型 | `deepseek-v4-pro` |
| `COPILOT_PROMPT_PATH` | Copilot 提示词路径 | 空 |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` | Copilot 服务各提供商密钥 | 空 |
| `CUSTOM_LLM_API_KEY` / `CUSTOM_LLM_BASE_URL` | Copilot 自定义 LLM | 空 |
| `WAND_LLM_API_KEY` / `WAND_LLM_BASE_URL` / `WAND_LLM_MODEL` | Wand 生成配置（透传给 simstudio 服务） | 空 |
| `OLLAMA_URL` | Ollama 地址 | `http://localhost:11434` |
| `SOCKET_SERVER_URL` | realtime 服务地址（服务端） | `http://realtime:3002` |
| `NEXT_PUBLIC_SOCKET_URL` | realtime 公网地址（浏览器；留空则浏览器走同源 `/socket.io`，假设反代已转发） | 空 |
| `ADMISSION_GATE_MAX_INFLIGHT` | 每 Pod 并发上限 | `500` |

### realtime 服务（apps/realtime/.env）

| 变量 | 作用 | 默认值 |
|---|---|---|
| `NODE_ENV` | 运行环境 | `development` |
| `PORT` | 监听端口 | `3002` |
| `DATABASE_URL` | 主库连接串（与 apps/sim 一致） | — |
| `DATABASE_URL_REALTIME` / `DATABASE_REPLICA_URL_REALTIME` | realtime 角色 URL 覆盖 | 空 |
| `BETTER_AUTH_URL` / `BETTER_AUTH_SECRET` | 认证（与 apps/sim 一致） | — |
| `INTERNAL_API_SECRET` | 内部 RPC 密钥（与 apps/sim 一致） | — |
| `NEXT_PUBLIC_APP_URL` | 应用公网地址（CORS 白名单与基础 URL） | — |
| `REDIS_URL` | 跨 Pod 房间管理；单实例可省略（内存房间） | 空 |
| `ALLOWED_ORIGINS` | 额外 Socket.IO CORS 白名单（逗号分隔） | 空 |
| `SIM_DB_ROLE` | 池角色 `realtime` | 空 |
| `DISABLE_AUTH` | 可信内网完全关闭认证 | 空 |

### packages/db（迁移与脚本）

| 变量 | 作用 | 默认值 |
|---|---|---|
| `DATABASE_URL` | drizzle-kit / `db:migrate` / `register-sso-provider` 等脚本连接串（与 apps/sim 一致；迁移始终连主库） | — |
| `MIGRATION_DATABASE_URL` | PgBouncer 事务池场景的直连 DSN（session advisory lock 需要） | 回退 `DATABASE_URL` |
| `POSTGRES_URL` | 部分脚本的备选连接串 | 回退 `DATABASE_URL` |
| `API_ENCRYPTION_KEY` | `backfill-api-key-hash` 等脚本解密用 | 空 |

### 可选：docs 文档站点（apps/docs）

| 变量 | 作用 | 默认值 |
|---|---|---|
| `OPENAI_API_KEY` / `OPENAI_CHAT_MODEL` | "Ask AI" 文档问答模型 | 模型默认 `gpt-5.4-mini` |
| `DOCS_ALLOWED_ORIGINS` | 问答接口 CORS 白名单（逗号分隔） | 空 |
| `NEXT_PUBLIC_DOCS_URL` | 文档站地址 | `https://docs.sim.ai` |
| `NEXT_PUBLIC_BLOB_BASE_URL` | CDN 基地址 | 空 |
| `SIM_API_KEY` / `SIM_BASE_URL` / `WEBHOOK_SECRET` | 文档站调用 Sim API 的鉴权与回调 | 空 |

### 开发与发布脚本

| 变量 | 作用 | 默认值 |
|---|---|---|
| `SIM_DEV_MINIMAL_REGISTRY` | 开发模式启用精简块注册表（加速 dev 启动） | 空 |
| `REACT_GRAB_ENABLED` / `REACT_SCAN_ENABLED` | React Grab（Cursor UI 调试）/ React Scan（性能调试），仅开发 | 空 |
| `GH_PAT` | `scripts/create-single-release.ts` 发布脚本 GitHub token | 空 |
| `E2B_API_KEY` | `build-pi-e2b-template` 构建脚本 | 空 |
| `DOCKER_BUILD` | Docker 构建环境标记 | 空 |

## Chat API Keys

Chat 是 Sim 托管服务。自托管实例要使用 Chat：

- 前往 https://sim.ai → Settings → Chat keys 生成 Chat API key
- 将该值写入自托管实例 `apps/sim/.env` 的 `COPILOT_API_KEY`（Docker Compose 部署则写入 `.env` 的 `COPILOT_API_KEY`）

## 技术栈

<details>
<summary>Next.js · Bun · PostgreSQL · Drizzle · Better Auth · Tailwind —— 以及其余组件</summary>

- **框架**: [Next.js](https://nextjs.org/)（App Router）
- **运行时**: [Bun](https://bun.sh/)
- **数据库**: PostgreSQL + [Drizzle ORM](https://orm.drizzle.team) + [pgvector](https://github.com/pgvector/pgvector)
- **认证**: [Better Auth](https://better-auth.com)
- **Schema 校验**: [Zod](https://zod.dev)
- **UI**: [Shadcn](https://ui.shadcn.com/)、[Tailwind CSS](https://tailwindcss.com)
- **流式 Markdown**: [Streamdown](https://github.com/vercel/streamdown)
- **状态管理**: [Zustand](https://zustand-demo.pmnd.rs/)、[TanStack Query](https://tanstack.com/query)
- **流程编辑器**: [ReactFlow](https://reactflow.dev/)
- **文档**: [Fumadocs](https://fumadocs.vercel.app/)
- **Monorepo**: [Turborepo](https://turborepo.org/)
- **实时通信**: [Socket.io](https://socket.io/)
- **后台任务**: [Trigger.dev](https://trigger.dev/)
- **远程代码执行**: [E2B](https://www.e2b.dev/)
- **隔离代码执行**: [isolated-vm](https://github.com/laverdet/isolated-vm)

</details>

## 贡献

欢迎贡献！详见 [贡献指南](.github/CONTRIBUTING.md)。

## License

本项目基于 Apache License 2.0 开源 —— 详见 [LICENSE](LICENSE) 文件。

<p align="center">
  <img src="apps/sim/public/static/readme-built-by-sim-team.png" alt="Built by the Sim team in San Francisco" width="100%"/>
</p>
