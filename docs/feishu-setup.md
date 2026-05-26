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

## 4. 配置事件订阅

左侧菜单「事件与回调」：

1. **加密策略**：复制「Encrypt Key」（可选，留空也行）
2. **Verification Token**：复制此值
3. **事件配置** → 点击「添加事件」→ 搜索并订阅：
   - `im.message.receive_v1`（接收消息）
4. **请求方式**：选择 **WebSocket 模式**（无需公网 URL）

## 5. 开通权限

左侧菜单「权限管理」，搜索并开通以下权限：

| 权限 | 说明 |
|------|------|
| `im:message` | 获取与发送单聊、群组消息 |
| `im:message:send_as_bot` | 以应用身份发送消息 |
| `im:resource` | 获取消息中的资源文件 |

## 6. 发布应用

1. 左侧菜单「版本管理与发布」→ 点击「创建版本」
2. 填写版本号和更新说明
3. 点击「申请发布」，等待管理员审批通过

## 7. 配置环境变量

复制 `.env.example` 为 `.env`，填入上面获取的凭证：

```bash
cp .env.example .env
```

```env
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FEISHU_ENCRYPT_KEY=（可选，留空即可）
FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAULT_PATH=D:/你的obsidian仓库路径
PORT=3000
```

## 8. 启动服务

```bash
bun install
bun run start
```

看到以下输出说明连接成功：

```
╔══════════════════════════════════════╗
║     brain-bot (WebSocket 模式)       ║
╠══════════════════════════════════════╣
║  无需公网 URL，直连飞书服务器        ║
║  Vault: D:/你的obsidian仓库路径...
╚══════════════════════════════════════╝
```

## 9. 测试

在飞书中找到你的应用机器人（搜索应用名称），私聊发送：

- `今天天气不错` → 写入 `daily/2026-05-26.md`
- `@人 张三 - 技术合伙人` → 写入 `people/zhang-san.md`
- 发一张图片 → 保存到 `attachments/` 并追加到日记

## 常见问题

### 收不到消息？

- 确认应用已发布且管理员已审批通过
- 确认已订阅 `im.message.receive_v1` 事件
- 确认已选择 WebSocket 模式（不是 HTTP 回调）

### 回复消息失败？

- 确认已开通 `im:message:send_as_bot` 权限
- 确认应用已发布

### 图片/文件下载失败？

- 确认已开通 `im:resource` 权限
