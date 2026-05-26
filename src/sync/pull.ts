import * as lark from "@larksuiteoapi/node-sdk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

/** 从飞书文档拉取内容到 Obsidian vault */
export async function pullFromFeishu(client: lark.Client, vaultPath: string, urlOrId: string): Promise<string> {
  if (!urlOrId) {
    return "请指定飞书文档 URL 或 ID，如：@拉取 https://xxx.feishu.cn/docx/xxxxxx";
  }

  // 从 URL 中提取 document_id
  const documentId = extractDocumentId(urlOrId);
  if (!documentId) {
    return "无法解析文档 ID，请提供完整的飞书文档链接";
  }

  try {
    // 获取文档原始内容
    const resp = await client.docx.document.rawContent({
      path: { document_id: documentId },
    });

    const content = resp.data?.content;
    if (!content) {
      return "文档内容为空或无法访问";
    }

    // 获取文档元信息
    let docTitle = documentId;
    try {
      const docInfo = await client.docx.document.get({
        path: { document_id: documentId },
      });
      docTitle = docInfo.data?.document?.title || documentId;
    } catch {}

    // 将飞书 block 内容转为 markdown
    const markdown = feishuBlocksToMarkdown(content);

    // 生成文件路径
    const safeTitle = docTitle.replace(/[<>:"/\\|?*]/g, "-").trim();
    const targetDir = join(vaultPath, "imports");
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = join(targetDir, `${safeTitle}.md`);

    // 生成 frontmatter
    const frontmatter = [
      "---",
      `type: import`,
      `source: feishu`,
      `document_id: ${documentId}`,
      `date: ${new Date().toISOString().slice(0, 10)}`,
      "---",
      "",
    ].join("\n");

    writeFileSync(targetPath, frontmatter + `# ${docTitle}\n\n${markdown}`, "utf-8");

    return `已拉取到 imports/${safeTitle}.md`;
  } catch (err) {
    console.error("[拉取] 获取飞书文档失败:", err);
    return `拉取失败: ${err instanceof Error ? err.message.slice(0, 100) : "未知错误"}`;
  }
}

/** 从 URL 或 ID 中提取 document_id */
function extractDocumentId(input: string): string | null {
  const trimmed = input.trim();

  // 直接是 ID（不含 / 和 .）
  if (/^[a-zA-Z0-9]+$/.test(trimmed) && trimmed.length > 10) {
    return trimmed;
  }

  // URL 格式：https://xxx.feishu.cn/docx/xxxxxx 或 /docx/xxxxxx
  const match = trimmed.match(/\/docx\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/** 将飞书文档 block 内容转为 markdown（简化版） */
function feishuBlocksToMarkdown(content: string): string {
  try {
    const blocks = JSON.parse(content);
    if (!Array.isArray(blocks)) return content;

    return blocks.map((block: any) => {
      const type = block.block_type;

      // 文本段落
      if (type === 2 || type === 1) {
        return extractTextElements(block.text?.elements || block.paragraph?.elements);
      }

      // 标题
      if (type >= 3 && type <= 11) {
        const level = type - 2; // 3=heading1, 4=heading2, ...
        const headingKey = `heading${level}`;
        const elements = block[headingKey]?.elements || [];
        return "#".repeat(level) + " " + extractTextElements(elements);
      }

      // 分隔线
      if (type === 22) {
        return "---";
      }

      // 其他类型转为纯文本
      return "";
    }).filter(Boolean).join("\n\n");
  } catch {
    // JSON 解析失败，直接返回原文
    return content;
  }
}

/** 从飞书 text elements 提取纯文本 */
function extractTextElements(elements: any[]): string {
  if (!elements) return "";
  return elements.map((el: any) => {
    if (el.text_run) return el.text_run.content || "";
    if (el.mention_user) return `@${el.mention_user.user_id || "用户"}`;
    return "";
  }).join("");
}
