import * as lark from "@larksuiteoapi/node-sdk";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** 搜索本地 vault + 飞书消息 */
export async function searchMessages(client: lark.Client, vaultPath: string, query: string): Promise<string> {
  if (!query) {
    return "请指定搜索关键词，如：@搜索 张三";
  }

  const results: string[] = [];

  // 1. 本地 vault 搜索
  const localResults = searchLocalVault(vaultPath, query);
  if (localResults.length > 0) {
    results.push(`## 本地知识库 (${localResults.length} 条)`);
    results.push(localResults.slice(0, 10).join("\n"));
    if (localResults.length > 10) {
      results.push(`... 还有 ${localResults.length - 10} 条结果`);
    }
  } else {
    results.push(`## 本地知识库\n无结果`);
  }

  // 2. 飞书消息搜索
  try {
    const resp = await client.im.v1.message.list({
      params: {
        container_id_type: "chat",
        container_id: "",
        start_time: getDaysAgo(7), // 搜索最近7天
        end_time: nowTs(),
        sort_type: "ByCreateTimeDesc",
        page_size: 20,
      },
    });

    const messages = resp.data?.items || [];
    const matched = messages.filter((msg: any) => {
      try {
        const content = JSON.parse(msg.body?.content || "{}");
        const text = content.text || "";
        return text.includes(query);
      } catch {
        return false;
      }
    });

    if (matched.length > 0) {
      results.push(`\n## 飞书消息 (${matched.length} 条)`);
      for (const msg of matched.slice(0, 5)) {
        try {
          const content = JSON.parse(msg.body?.content || "{}");
          const text = content.text || "";
          const preview = text.length > 50 ? text.slice(0, 50) + "..." : text;
          const time = msg.create_time ? new Date(Number(msg.create_time)).toLocaleString("zh-CN") : "";
          results.push(`- [${time}] ${preview}`);
        } catch {}
      }
    } else {
      results.push(`\n## 飞书消息\n无结果`);
    }
  } catch (err) {
    console.error("[搜索] 飞书消息搜索失败:", err);
    results.push(`\n## 飞书消息\n搜索失败`);
  }

  return results.join("\n");
}

/** 本地 vault 全文搜索 */
function searchLocalVault(vaultPath: string, query: string): string[] {
  const results: string[] = [];
  const searchDirs = ["people", "companies", "concepts", "projects", "daily"];

  for (const dir of searchDirs) {
    const dirPath = join(vaultPath, dir);
    if (!existsSync(dirPath)) continue;

    const files = readdirSync(dirPath).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const filePath = join(dirPath, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const matchedLines: { num: number; text: string }[] = [];

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query.toLowerCase())) {
            matchedLines.push({ num: i + 1, text: lines[i].trim() });
          }
        }

        if (matchedLines.length > 0) {
          const relPath = relative(vaultPath, filePath).replace(/\\/g, "/");
          for (const match of matchedLines.slice(0, 2)) {
            const preview = match.text.length > 60 ? match.text.slice(0, 60) + "..." : match.text;
            results.push(`- ${relPath}:${match.num} → ${preview}`);
          }
        }
      } catch {}
    }
  }

  return results;
}

/** 获取 N 天前的时间戳（秒） */
function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return String(Math.floor(d.getTime() / 1000));
}

/** 当前时间戳（秒） */
function nowTs(): string {
  return String(Math.floor(Date.now() / 1000));
}
