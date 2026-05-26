import type { KnowledgeItem } from "./sync/inbox-organizer";

const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const API_KEY = process.env.DEEPSEEK_API_KEY || "";

/** 调用 DeepSeek API */
async function chat(systemPrompt: string, userContent: string): Promise<string> {
  if (!API_KEY) {
    throw new Error("未配置 DEEPSEEK_API_KEY");
  }

  const resp = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`DeepSeek API 错误: ${resp.status} ${err}`);
  }

  const data = (await resp.json()) as any;
  return data.choices?.[0]?.message?.content || "";
}

/** 为笔记内容生成标签 */
export async function generateTags(content: string): Promise<string[]> {
  const result = await chat(
    `你是一个知识管理助手。根据笔记内容，生成 3-5 个相关的中文标签。
只返回标签列表，每行一个，不要加 # 号，不要加其他解释。
示例输出：
人工智能
创业
技术合伙人`,
    content
  );

  return result
    .split("\n")
    .map((t: string) => t.trim().replace(/^#+\s*/, ""))
    .filter((t: string) => t.length > 0 && t.length < 20);
}

/** 分析笔记内容，找出与现有笔记的关联 */
export async function findLinks(
  content: string,
  existingNotes: { path: string; title: string; content: string }[]
): Promise<string[]> {
  if (existingNotes.length === 0) return [];

  const noteList = existingNotes
    .map((n) => `- ${n.title}（${n.path}）`)
    .join("\n");

  const result = await chat(
    `你是一个知识管理助手。给定一篇笔记内容和现有笔记列表，找出内容相关的笔记。
只返回相关笔记的路径，每行一个，不要加其他解释。如果没有相关的就返回空。
最多返回 5 个。`,
    `笔记内容：\n${content}\n\n现有笔记：\n${noteList}`
  );

  return result
    .split("\n")
    .map((line: string) => {
      // 提取路径（支持 markdown 链接格式）
      const match = line.match(/\(([^\)]+\.md)\)/) || line.match(/([\w\-\/]+\.md)/);
      return match ? match[1].trim() : line.trim().replace(/^[-*]\s*/, "");
    })
    .filter((p: string) => p.endsWith(".md") && existingNotes.some((n) => n.path === p));
}

/** 生成笔记摘要 */
export async function summarizeNotes(
  notes: { path: string; content: string }[],
  period: string
): Promise<string> {
  const notesText = notes
    .map((n) => `### ${n.path}\n${n.content.slice(0, 500)}`)
    .join("\n\n");

  return chat(
    `你是一个知识管理助手。根据用户在${period}记录的笔记，生成一份结构化摘要。
格式要求：
1. 用中文
2. 分主题归纳（用 ## 标题）
3. 每个主题下列出关键要点
4. 最后用一句话总结这段时间的核心收获`,
    notesText
  );
}

/** 为笔记内容建议双向链接 */
export async function suggestWikilinks(
  content: string,
  existingTitles: string[]
): Promise<{ original: string; link: string }[]> {
  if (existingTitles.length === 0) return [];

  const result = await chat(
    `你是一个知识管理助手。分析笔记内容，找出其中提到的概念、人物、项目，如果它们在现有笔记中有对应条目，就建议加上双向链接。
返回 JSON 数组，格式：[{"original": "原文中的词", "link": "对应笔记标题"}]
只返回 JSON，不要其他内容。如果没有匹配的就返回空数组 []。`,
    `笔记内容：\n${content}\n\n现有笔记标题：\n${existingTitles.join("、")}`
  );

  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {}
  return [];
}

/** 从 daily 内容中抽取应该分流到各目录的知识条目 */
export async function extractKnowledgeItems(content: string): Promise<KnowledgeItem[]> {
  const result = await chat(
    `你是一个个人知识库整理助手。用户会把日常碎片记录在 Obsidian daily 笔记里。
请从内容中抽取值得沉淀的条目，并分类到以下目录：
- people: 人物
- companies: 公司
- concepts: 想法、概念、灵感
- sources: 文章、视频、播客、书籍、网页等来源
- projects: 正在做的项目
- analysis: 决策、复盘、判断、策略

只返回 JSON 数组，不要解释。每项格式：
{
  "category": "people|companies|concepts|sources|projects|analysis",
  "title": "适合作为文件名的短标题",
  "summary": "这条内容应该沉淀到对应页面的一句话摘要",
  "sourceText": "daily 原文中可以被替换成链接的原始词或短语",
  "tags": ["标签1", "标签2"]
}

规则：
- 不要抽取太泛的词，比如 今天、文章、项目、想法。
- sourceText 必须真实出现在原文中。
- title 尽量短，适合长期复用。
- 不确定就少抽取，不要硬凑。
- 最多返回 12 项。`,
    content
  );

  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as KnowledgeItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}
