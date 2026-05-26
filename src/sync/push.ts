import * as lark from "@larksuiteoapi/node-sdk";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 推送本地 markdown 到飞书文档 */
export async function pushToFeishu(client: lark.Client, vaultPath: string, filePath: string): Promise<string> {
  if (!filePath) {
    return "请指定文件路径，如：@推送 people/zhang-san.md";
  }

  // 规范化路径
  const cleanPath = filePath.replace(/\\/g, "/").replace(/^\//, "");
  const fullPath = join(vaultPath, cleanPath);

  if (!existsSync(fullPath)) {
    return `文件不存在: ${cleanPath}`;
  }

  const content = readFileSync(fullPath, "utf-8");

  // 提取标题（第一个 # 标题或文件名）
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : cleanPath.split("/").pop()?.replace(".md", "") || "未命名";

  // 去掉 frontmatter
  const bodyContent = content.replace(/^---[\s\S]*?---\n*/, "").trim();

  try {
    // 创建飞书文档
    const resp = await client.docx.document.create({
      data: {
        title,
        folder_token: "", // 创建到根目录
      },
    });

    const documentId = resp.data?.document?.document_id;
    if (!documentId) {
      return "创建文档失败：未返回 document_id";
    }

    // 获取文档的第一个 block（body block）
    const docBlocks = await client.docx.documentBlock.list({
      path: { document_id: documentId },
    });

    const bodyBlockId = docBlocks.data?.items?.[0]?.block_id;
    if (bodyBlockId) {
      // 将 markdown 内容转为飞书文档 block
      const blocks = markdownToBlocks(bodyContent);
      if (blocks.length > 0) {
        await client.batch({
          data: {
            requests: blocks.map((block, i) => ({
              method: "POST",
              url: `/open-apis/docx/v1/documents/${documentId}/blocks/${bodyBlockId}/children`,
              data: {
                children: [block],
                index: i,
              },
            })),
          },
        });
      }
    }

    // 读取当前内容并追加来源信息
    const sourceInfo = `\n\n---\n来源: brain-bot (${cleanPath})`;
    const currentContent = await client.docx.document.rawContent({
      path: { document_id: documentId },
    });

    // 构造飞书文档链接
    const docUrl = `https://open.feishu.cn/docx/${documentId}`;

    return `已推送到飞书文档\n标题: ${title}\n链接: ${docUrl}`;
  } catch (err) {
    console.error("[推送] 创建飞书文档失败:", err);
    return `推送失败: ${err instanceof Error ? err.message.slice(0, 100) : "未知错误"}`;
  }
}

/** 将 markdown 内容转为飞书文档 block */
function markdownToBlocks(content: string): any[] {
  const blocks: any[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 标题
    if (trimmed.startsWith("### ")) {
      blocks.push({
        block_type: 4, // heading3
        heading3: { elements: [{ text_run: { content: trimmed.slice(4) } }] },
      });
    } else if (trimmed.startsWith("## ")) {
      blocks.push({
        block_type: 3, // heading2
        heading2: { elements: [{ text_run: { content: trimmed.slice(3) } }] },
      });
    } else if (trimmed.startsWith("# ")) {
      blocks.push({
        block_type: 2, // heading1
        heading1: { elements: [{ text_run: { content: trimmed.slice(2) } }] },
      });
    } else if (trimmed.startsWith("- ")) {
      // 列表项转为普通段落（飞书 API 创建列表较复杂）
      blocks.push({
        block_type: 2, // text
        text: { elements: [{ text_run: { content: "• " + trimmed.slice(2) } }] },
      });
    } else if (trimmed.startsWith("---")) {
      // 分隔线
      blocks.push({
        block_type: 22, // divider
      });
    } else {
      // 普通段落
      blocks.push({
        block_type: 2, // text
        text: { elements: [{ text_run: { content: trimmed } }] },
      });
    }
  }

  return blocks;
}
