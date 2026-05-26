export type Category = "people" | "companies" | "concepts" | "projects" | "daily" | "sync" | "push" | "pull" | "syncwiki" | "search" | "organize" | "summary";

export interface ParsedMessage {
  category: Category;
  /** 文件名（不含 .md），如 "zhang-san"、"2026-05-25" */
  slug: string;
  /** 去掉前缀后的正文 */
  content: string;
  /** 可选：页面标题 */
  title: string;
  /** 从 #标签 提取的标签列表 */
  tags: string[];
}

const PREFIX_MAP: { prefix: string; category: Category }[] = [
  // 命令类指令（/ 前缀，优先匹配）
  { prefix: "/同步wiki", category: "syncwiki" },
  { prefix: "/syncwiki", category: "syncwiki" },
  { prefix: "/同步", category: "sync" },
  { prefix: "/sync", category: "sync" },
  { prefix: "/推送", category: "push" },
  { prefix: "/push", category: "push" },
  { prefix: "/拉取", category: "pull" },
  { prefix: "/pull", category: "pull" },
  { prefix: "/搜索", category: "search" },
  { prefix: "/search", category: "search" },
  { prefix: "/整理", category: "organize" },
  { prefix: "/organize", category: "organize" },
  { prefix: "/摘要", category: "summary" },
  { prefix: "/summary", category: "summary" },
  // 知识分类（@ 前缀）
  { prefix: "@人", category: "people" },
  { prefix: "@person", category: "people" },
  { prefix: "@公司", category: "companies" },
  { prefix: "@company", category: "companies" },
  { prefix: "@想法", category: "concepts" },
  { prefix: "@idea", category: "concepts" },
  { prefix: "@项目", category: "projects" },
  { prefix: "@project", category: "projects" },
];

/** 中文/英文名转 slug：去掉特殊字符，空格转连字符 */
function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** 命令类 category 集合 */
const COMMAND_CATEGORIES = new Set<Category>(["sync", "push", "pull", "syncwiki", "search", "organize", "summary"]);

/** 获取今天的日期 slug */
function todaySlug(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 从文本中提取 #标签（支持中文/英文/数字） */
function extractTags(text: string): string[] {
  const matches = text.match(/#[\w\u4e00-\u9fff]+/g);
  if (!matches) return [];
  // 去重
  return [...new Set(matches.map(t => t.slice(1)))];
}

/**
 * 解析飞书消息，路由到对应分类。
 *
 * 格式：
 *   @人 张三 - 技术合伙人，YC Demo Day 认识
 *   @公司 Acme - AI 编程教育
 *   @想法 agent 的记忆应该是知识图谱
 *   @项目 gbrain-obsidian集成 - 进行中
 *   无前缀 → daily
 *
 * 支持用 `-` 或 `：` 分隔标题和正文。
 */
export function parseMessage(text: string): ParsedMessage {
  const trimmed = text.trim().replace(/^／/, "/");

  for (const { prefix, category } of PREFIX_MAP) {
    if (!trimmed.startsWith(prefix)) continue;

    const rest = trimmed.slice(prefix.length).trim();

    // 命令类指令：整个 rest 作为参数，不做分隔
    if (COMMAND_CATEGORIES.has(category)) {
      return {
        category,
        slug: "",
        content: rest,
        title: rest,
        tags: [],
      };
    }

    // 知识分类：用 `-` 或 `：` 或 `:` 分隔名称和内容
    const sepMatch = rest.match(/^(.+?)(?:\s*[-：:]\s*)([\s\S]+)$/);

    if (sepMatch) {
      const name = sepMatch[1].trim();
      const content = sepMatch[2].trim();
      return {
        category,
        slug: toSlug(name),
        content,
        title: name,
        tags: extractTags(content),
      };
    }

    // 没有分隔符，整段当名称，内容为空
    return {
      category,
      slug: toSlug(rest),
      content: "",
      title: rest.trim(),
      tags: extractTags(rest),
    };
  }

  // 无前缀 → daily
  return {
    category: "daily",
    slug: todaySlug(),
    content: trimmed,
    title: todaySlug(),
    tags: extractTags(trimmed),
  };
}
