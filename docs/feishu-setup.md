# 飞书机器人接入教程

## 1. 创建飞书应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app)
2. 点击「创建企业自建应用」
3. 填写应用名称（如「本地知识库」）和描述，点击「创建」

## 2. 获取应用凭证

进入应用详情页 → 左侧菜单「凭证与基础信息」：

- **App ID**：格式为 `cli_xxxxxxxxxxxxxxxx`
- **App Secret**：点击「显示」获取

复制这两个值，稍后填入 `.env`。

## 3. 添加机器人能力

左侧菜单「应用能力」→「添加应用能力」→ 勾选「机器人」→ 点击「确定添加」。

## 4. 配置事件订阅（重点：长连接模式）

这一步最关键，很多人卡在这里。你需要把事件订阅方式从默认的「HTTP 回调」改成「长连接」。

### 4.1 进入事件配置页面

左侧菜单点击「事件与回调」，你会看到一个配置页面。

### 4.2 切换到长连接模式

在页面顶部找到「订阅方式」或「请求方式」的选项：

```
┌─────────────────────────────────────────────────┐
│  订阅方式                                       │
│                                                 │
│  ○ 使用请求地址接收（HTTP 回调）                │
│    需要公网 URL，如 https://your-server/webhook  │
│                                                 │
│  ● 使用长连接接收（WebSocket）  ← 选这个！      │
│    无需公网 URL，SDK 自动连接飞书服务器          │
└─────────────────────────────────────────────────┘
```

**选择「使用长连接接收」**，然后点击「保存」或「确定」。

> ⚠️ 如果你选了 HTTP 回调模式，brain-bot 无法工作！必须选长连接。

### 4.3 添加事件

在同一页面，找到「事件配置」区域，点击「添加事件」：

1. 搜索框输入 `im.message.receive_v1`
2. 找到「接收消息」事件，点击添加
3. 确认事件列表里出现了这个事件

### 4.4 复制 Verification Token

在同一页面，找到「Encrypt Key」和「Verification Token」：

- **Encrypt Key**：可以留空（不加密也行）
- **Verification Token**：复制这个值，填入 `.env` 的 `FEISHU_VERIFICATION_TOKEN`

## 5. 开通权限

左侧菜单「权限管理」，搜索并开通以下权限：

| 权限标识 | 说明 | 用途 |
|---------|------|------|
| `im:message` | 获取与发送单聊、群组消息 | 收发文字消息 |
| `im:message:send_as_bot` | 以应用身份发送消息 | 回复用户 |
| `im:resource` | 获取消息中的资源文件 | 下载图片/语音/文件 |

如果要使用指令功能，还需要额外开通：

| 权限标识 | 说明 | 用途 |
|---------|------|------|
| `calendar:calendar:read` | 读取日历日程 | `/同步` 指令 |
| `vc:meeting:read` | 读取会议记录 | `/同步` 指令 |
| `docx:document` | 创建/读取飞书文档 | `/推送` `/拉取` 指令 |
| `wiki:wiki` | 管理知识库 | `/同步wiki` 指令 |

## 6. 发布应用

1. 左侧菜单「版本管理与发布」→ 点击「创建版本」
2. 填写版本号（如 `1.0.0`）和更新说明
3. 点击「申请发布」
4. 等待管理员审批通过（如果是自己创建的应用，通常秒过）

> ⚠️ 应用未发布前，只有创建者能使用。发布后其他人才能搜索到机器人。

## 7. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

填入上面获取的凭证：

```env
# 飞书应用凭证（步骤2获取）
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 事件订阅（步骤4获取）
FEISHU_ENCRYPT_KEY=（可选，留空即可）
FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Obsidian vault 路径（改成你自己的）
VAULT_PATH=D:/你的obsidian仓库路径

# DeepSeek API（AI 整理功能需要，去 https://platform.deepseek.com 申请）
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 8. 启动服务

```bash
# 安装依赖
bun install

# 启动
bun run start
```

看到以下输出说明长连接成功：

```
[info]: client ready
[info]: event-dispatch is ready
[info]: ws client ready

╔══════════════════════════════════════╗
║     brain-bot (WebSocket 模式)       ║
╠══════════════════════════════════════╣
║  无需公网 URL，直连飞书服务器        ║
║  Vault: D:/你的obsidian仓库路径...
╚══════════════════════════════════════╝
```

> 如果看到 `ws client ready` 就说明长连接建好了。如果卡住不动或报错，检查步骤4是否选了长连接模式。

## 9. 测试

在飞书中搜索你的应用名称，打开私聊窗口，发送：

- `今天天气不错` → 写入 `daily/2026-05-26.md`
- `@人 张三 - 技术合伙人` → 写入 `people/zhang-san.md`
- 发一张图片 → 保存到 `attachments/` 并追加到日记
- `/整理` → AI 自动整理今日笔记
- `/搜索 关键词` → 搜索知识库

## 常见问题

### 启动后没有看到 `ws client ready`？

- 检查步骤4是否选择了「长连接」模式（不是 HTTP 回调）
- 检查 App ID 和 App Secret 是否填对
- 检查应用是否已发布

### 收不到消息？

- 确认应用已发布且管理员已审批通过
- 确认已订阅 `im.message.receive_v1` 事件
- 确认已选择 WebSocket 模式（不是 HTTP 回调）

### 回复消息失败？

- 确认已开通 `im:message:send_as_bot` 权限
- 确认应用已发布

### 图片/文件下载失败？

- 确认已开通 `im:resource` 权限

### `/整理` 等指令没反应？

- 确认已配置 `DEEPSEEK_API_KEY`
- 检查终端日志是否有报错
