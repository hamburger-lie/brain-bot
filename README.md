# brain-bot

飞书 Bot → Obsidian Vault 自动记录服务。通过飞书私聊发送消息，自动分类写入 Obsidian 知识库，并支持与飞书文档、知识库的双向同步和 AI 智能整理。

## 功能

### 基础功能
- **文字消息**：自动写入 Obsidian vault，支持前缀分类
- **图片消息**：下载并保存到 `attachments/`，追加到当日日记
- **语音消息**：下载并保存到 `attachments/`
- **文件消息**：下载并保存到 `attachments/`

### 指令功能

| 指令 | 说明 | 示例 |
|------|------|------|
| `@同步` / `@sync` | 同步飞书日历和会议到日记 | `@同步` |
| `@推送` / `@push` | 推送本地 markdown 到飞书文档 | `@推送 people/zhang-san.md` |
| `@拉取` / `@pull` | 从飞书文档拉取内容到本地 | `@拉取 https://xxx.feishu.cn/docx/xxx` |
| `@同步wiki` / `@syncwiki` | 同步 vault 到飞书知识库 | `@同步wiki` |
| `@搜索` / `@search` | 搜索本地知识库和飞书消息 | `@搜索 张三` |
| `@整理` / `@organize` | AI 自动打标签和建双向链接 | `@整理` 或 `@整理 people/zhang-san.md` |
| `@摘要` / `@summary` | AI 生成知识摘要 | `@摘要`、`@摘要 本周`、`@摘要 本月` |

### 消息分类

| 前缀 | 分类 | 示例 |
|------|------|------|
| `@人` / `@person` | people | `@人 张三 - 技术合伙人` |
| `@公司` / `@company` | companies | `@公司 Acme - AI 编程教育` |
| `@想法` / `@idea` | concepts | `@想法 agent 的记忆应该是知识图谱` |
| `@项目` / `@project` | projects | `@项目 brain-bot - 进行中` |
| 无前缀 | daily | 直接写入当日日记 |

支持用 `-`、`:` 或 `：` 分隔标题和正文。支持 `#标签` 自动提取。

## 安装

```bash
bun install
```

## 配置

> 首次使用？请先阅读 [飞书机器人接入教程](docs/feishu-setup.md)

复制 `.env.example` 为 `.env`，填入飞书应用凭证：

```bash
cp .env.example .env
```

| 变量 | 说明 |
|------|------|
| `FEISHU_APP_ID` | 飞书企业自建应用 App ID |
| `FEISHU_APP_SECRET` | 飞书企业自建应用 App Secret |
| `FEISHU_ENCRYPT_KEY` | 事件订阅加密密钥（可选） |
| `FEISHU_VERIFICATION_TOKEN` | 事件订阅验证 Token |
| `VAULT_PATH` | Obsidian vault 路径 |
| `PORT` | 服务端口（默认 3000） |
| `WIKI_SPACE_ID` | 飞书知识库 Space ID（可选） |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（AI 整理/摘要功能） |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址（默认 https://api.deepseek.com） |

### 飞书应用权限

使用指令功能需要额外开通以下权限：

| 权限 | 用途 |
|------|------|
| `calendar:calendar:read` | 读取日历日程 |
| `vc:meeting:read` | 读取会议记录 |
| `docx:document` | 创建/读取飞书文档 |
| `wiki:wiki` | 管理知识库 |

## 运行

```bash
# 开发模式（自动重启）
bun run dev

# 生产模式
bun run start
```

## 架构

```
src/
├── index.ts          # 入口，初始化飞书客户端和 WebSocket 连接
├── feishu.ts         # 飞书 API 封装（消息处理、媒体下载、指令路由）
├── parser.ts         # 消息解析（前缀路由、标签提取）
├── writer.ts         # Obsidian vault 写入（frontmatter 生成）
├── ai.ts             # DeepSeek API 封装（标签生成、关联发现、摘要）
└── sync/
    ├── calendar.ts   # 日历/会议同步
    ├── push.ts       # Obsidian → 飞书文档
    ├── pull.ts       # 飞书文档 → Obsidian
    ├── wiki.ts       # Obsidian → 飞书知识库
    ├── search.ts     # 本地 + 飞书消息检索
    ├── organize.ts   # AI 自动整理（打标签、建链接）
    └── summary.ts    # AI 知识摘要生成
```

使用飞书 WebSocket 长连接，无需公网 URL。
