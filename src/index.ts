import * as lark from "@larksuiteoapi/node-sdk";
import { initFeishuClient, createEventDispatcher, startDailyOrganizeScheduler } from "./feishu";

// 加载 .env（Bun 原生支持）
const APP_ID = process.env.FEISHU_APP_ID || "";
const APP_SECRET = process.env.FEISHU_APP_SECRET || "";
const VAULT_PATH = process.env.VAULT_PATH || "";

if (!APP_ID || !APP_SECRET) {
  console.error("缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET，请检查 .env 文件");
  process.exit(1);
}
if (!VAULT_PATH) {
  console.error("缺少 VAULT_PATH，请检查 .env 文件");
  process.exit(1);
}

// 初始化飞书客户端
initFeishuClient(APP_ID, APP_SECRET);

// 创建事件分发器
const eventDispatcher = createEventDispatcher(VAULT_PATH);
startDailyOrganizeScheduler(VAULT_PATH);

// WebSocket 连接（无需公网 URL）
const wsClient = new lark.WSClient({
  appId: APP_ID,
  appSecret: APP_SECRET,
  loggerLevel: lark.LoggerLevel.info,
});

wsClient.start({ eventDispatcher });

console.log(`
╔══════════════════════════════════════╗
║     brain-bot (WebSocket 模式)       ║
╠══════════════════════════════════════╣
║  无需公网 URL，直连飞书服务器        ║
║  Vault: ${VAULT_PATH.slice(0, 30)}...
╚══════════════════════════════════════╝

在飞书私聊「本地知识库」发消息即可：
  文字 → 写入 daily/ 或按前缀分类
  图片 → 保存到 attachments/ 并追加到日记
`);
