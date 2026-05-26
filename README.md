# brain-bot

飞书 Bot → Obsidian Vault 自动记录服务。通过飞书私聊发送消息，自动分类写入 Obsidian 知识库。

## 功能

- **文字消息**：自动写入 Obsidian vault，支持前缀分类
- **图片消息**：下载并保存到 `attachments/`，追加到当日日记
- **语音消息**：下载并保存到 `attachments/`
- **文件消息**：下载并保存到 `attachments/`

## 消息格式

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
├── index.ts    # 入口，初始化飞书客户端和 WebSocket 连接
├── feishu.ts   # 飞书 API 封装（消息处理、媒体下载）
├── parser.ts   # 消息解析（前缀路由、标签提取）
└── writer.ts   # Obsidian vault 写入（frontmatter 生成）
```

使用飞书 WebSocket 长连接，无需公网 URL。
