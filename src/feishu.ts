import * as lark from "@larksuiteoapi/node-sdk";
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseMessage } from "./parser";
import { writeToVault } from "./writer";

let client: lark.Client;
let appAccessToken: string = "";
let tokenExpireAt: number = 0;

export function initFeishuClient(appId: string, appSecret: string) {
  client = new lark.Client({ appId, appSecret });
}

/** 获取 app_access_token（带缓存） */
async function getAppAccessToken(): Promise<string> {
  if (appAccessToken && Date.now() < tokenExpireAt) {
    return appAccessToken;
  }
  const appId = process.env.FEISHU_APP_ID || "";
  const appSecret = process.env.FEISHU_APP_SECRET || "";
  const resp = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    }
  );
  const data = (await resp.json()) as any;
  if (data.code !== 0) throw new Error(`获取 token 失败: ${data.msg}`);
  appAccessToken = data.app_access_token;
  tokenExpireAt = Date.now() + (data.expire - 60) * 1000; // 提前 60 秒过期
  return appAccessToken;
}

/** 当前时间 HH:MM */
function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 今天的日期 YYYY-MM-DD */
function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 回复飞书消息 */
async function replyMessage(messageId: string, text: string) {
  if (!client) return;
  try {
    await client.im.message.reply({
      path: { message_id: messageId },
      data: {
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });
  } catch (err) {
    console.error("回复消息失败:", err);
  }
}

/** 下载飞书图片并保存到 vault */
async function downloadImage(imageKey: string, vaultPath: string): Promise<string> {
  const attDir = join(vaultPath, "attachments");
  if (!existsSync(attDir)) {
    mkdirSync(attDir, { recursive: true });
  }

  const filename = `${todayDate()}_${Date.now()}.png`;
  const filePath = join(attDir, filename);

  const token = await getAppAccessToken();
  const resp = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/images/${imageKey}?image_type=message`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`下载图片失败: ${resp.status} ${errText}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  writeFileSync(filePath, Buffer.from(arrayBuffer));
  return `attachments/${filename}`;
}

/** 把媒体引用追加到今天的日记 */
function appendToDaily(vaultPath: string, relPath: string, type: "image" | "audio" | "file", filename?: string) {
  const dailyDir = join(vaultPath, "daily");
  if (!existsSync(dailyDir)) {
    mkdirSync(dailyDir, { recursive: true });
  }

  const dailyFile = join(dailyDir, `${todayDate()}.md`);
  let entry: string;
  if (type === "image") {
    entry = `\n### ${nowTime()}\n![[${relPath}]]\n`;
  } else if (type === "audio") {
    entry = `\n### ${nowTime()}\n![[${relPath}]]\n`;
  } else {
    entry = `\n### ${nowTime()}\n[${filename || relPath}](${relPath})\n`;
  }

  if (!existsSync(dailyFile)) {
    const content = `---\ntype: daily\ndate: ${todayDate()}\ntags: []\n---\n\n# ${todayDate()}\n${entry}`;
    writeFileSync(dailyFile, content, "utf-8");
  } else {
    appendFileSync(dailyFile, entry, "utf-8");
  }
}

/** 下载飞书音频并保存到 vault */
async function downloadAudio(messageId: string, fileKey: string, vaultPath: string): Promise<string> {
  const attDir = join(vaultPath, "attachments");
  if (!existsSync(attDir)) {
    mkdirSync(attDir, { recursive: true });
  }

  const filename = `${todayDate()}_${Date.now()}.ogg`;
  const filePath = join(attDir, filename);

  const token = await getAppAccessToken();
  const resp = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=file`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`下载音频失败: ${resp.status} ${errText}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  writeFileSync(filePath, Buffer.from(arrayBuffer));
  return `attachments/${filename}`;
}

/** 下载飞书文件并保存到 vault */
async function downloadFile(messageId: string, fileKey: string, vaultPath: string, originalName?: string): Promise<{ relPath: string; filename: string }> {
  const attDir = join(vaultPath, "attachments");
  if (!existsSync(attDir)) {
    mkdirSync(attDir, { recursive: true });
  }

  const ext = originalName ? originalName.split(".").pop() : "bin";
  const filename = `${todayDate()}_${Date.now()}.${ext}`;
  const filePath = join(attDir, filename);

  const token = await getAppAccessToken();
  const resp = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=file`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`下载文件失败: ${resp.status} ${errText}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  writeFileSync(filePath, Buffer.from(arrayBuffer));
  return { relPath: `attachments/${filename}`, filename: originalName || filename };
}

/** 处理接收到的消息事件（文本 + 图片） */
export async function handleMessage(data: any, vaultPath: string) {
  try {
    const message = data.message;
    if (!message) return;

    // 图片消息
    if (message.message_type === "image") {
      const contentObj = JSON.parse(message.content);
      const imageKey = contentObj.image_key;
      if (!imageKey) {
        await replyMessage(message.message_id, "无法解析图片");
        return;
      }
      const imageRelPath = await downloadImage(imageKey, vaultPath);
      appendToDaily(vaultPath, imageRelPath, "image");
      await replyMessage(message.message_id, `图片已保存到 ${imageRelPath}`);
      console.log(`[图片] ${imageRelPath}`);
      return;
    }

    // 语音消息
    if (message.message_type === "audio") {
      console.log(`[语音] 收到语音消息, message_id=${message.message_id}, content=${message.content}`);
      let contentObj: any;
      try {
        contentObj = JSON.parse(message.content);
      } catch (parseErr) {
        console.error("[语音] 解析 content 失败:", parseErr, "raw:", message.content);
        await replyMessage(message.message_id, "语音解析失败，无法读取内容");
        return;
      }
      const fileKey = contentObj.file_key;
      if (!fileKey) {
        console.error("[语音] content 中没有 file_key:", contentObj);
        await replyMessage(message.message_id, "无法解析语音文件");
        return;
      }
      try {
        const audioRelPath = await downloadAudio(message.message_id, fileKey, vaultPath);
        appendToDaily(vaultPath, audioRelPath, "audio");
        await replyMessage(message.message_id, `语音已保存到 ${audioRelPath}`);
        console.log(`[语音] 保存成功: ${audioRelPath}`);
      } catch (downloadErr) {
        console.error("[语音] 下载或保存失败:", downloadErr);
        await replyMessage(message.message_id, `语音保存失败: ${downloadErr instanceof Error ? downloadErr.message : String(downloadErr)}`);
      }
      return;
    }

    // 文件消息
    if (message.message_type === "file") {
      const contentObj = JSON.parse(message.content);
      const fileKey = contentObj.file_key;
      const fileName = contentObj.file_name;
      if (!fileKey) {
        await replyMessage(message.message_id, "无法解析文件");
        return;
      }
      const { relPath, filename } = await downloadFile(message.message_id, fileKey, vaultPath, fileName);
      appendToDaily(vaultPath, relPath, "file", filename);
      await replyMessage(message.message_id, `文件已保存到 ${relPath}`);
      console.log(`[文件] ${relPath}`);
      return;
    }

    // 文本消息
    if (message.message_type === "text") {
      const contentObj = JSON.parse(message.content);
      const text = contentObj.text?.trim();
      if (!text) return;

      const parsed = parseMessage(text);
      const relativePath = writeToVault(vaultPath, parsed);

      const preview = parsed.content
        ? parsed.content.slice(0, 50) + (parsed.content.length > 50 ? "..." : "")
        : "(空页面)";
      await replyMessage(message.message_id, `已记录到 ${relativePath}\n${preview}`);
      console.log(`[写入] ${relativePath} ← "${text.slice(0, 40)}..."`);
      return;
    }

    // 其他消息类型
    await replyMessage(message.message_id, "目前支持文字、图片、语音和文件哦");
  } catch (err) {
    console.error("处理消息失败:", err);
    // 尽量回复用户，告知处理失败
    try {
      const messageId = data?.message?.message_id;
      if (messageId) {
        await replyMessage(messageId, `处理失败: ${err instanceof Error ? err.message.slice(0, 100) : "未知错误"}`);
      }
    } catch (replyErr) {
      console.error("回复失败通知也出错:", replyErr);
    }
  }
}

/** 创建飞书事件分发器 */
export function createEventDispatcher(vaultPath: string) {
  const dispatcher = new lark.EventDispatcher({
    encryptKey: process.env.FEISHU_ENCRYPT_KEY || "",
    verificationToken: process.env.FEISHU_VERIFICATION_TOKEN || "",
  });

  dispatcher.register({
    "im.message.receive_v1": async (data: any) => {
      const msgType = data?.message?.message_type || "unknown";
      console.log(`[事件] 收到消息事件: type=${msgType}, id=${data?.message?.message_id || "?"}`);
      await handleMessage(data, vaultPath);
    },
  });

  return dispatcher;
}
