import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type KnowledgeCategory = "people" | "companies" | "concepts" | "sources" | "projects" | "analysis";

export interface KnowledgeItem {
  category: KnowledgeCategory;
  title: string;
  summary: string;
  sourceText: string;
  tags?: string[];
}

export interface OrganizeDailyInboxOptions {
  date?: string;
  extractItems: (content: string) => Promise<KnowledgeItem[]>;
}

export interface OrganizeDailyInboxResult {
  scanned: number;
  created: number;
  updated: number;
  linked: number;
  reportPath: string;
  message: string;
}

const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  people: "人",
  companies: "公司",
  concepts: "想法",
  sources: "来源",
  projects: "项目",
  analysis: "分析",
};

export async function organizeDailyInbox(
  vaultPath: string,
  options: OrganizeDailyInboxOptions
): Promise<OrganizeDailyInboxResult> {
  const date = options.date || todayDate();
  const dailyRelPath = `daily/${date}.md`;
  const dailyPath = join(vaultPath, dailyRelPath);
  if (!existsSync(dailyPath)) {
    return {
      scanned: 0,
      created: 0,
      updated: 0,
      linked: 0,
      reportPath: "",
      message: `没有找到 ${dailyRelPath}`,
    };
  }

  const dailyContent = readFileSync(dailyPath, "utf-8");
  const items = normalizeItems(await options.extractItems(dailyContent));

  let created = 0;
  let updated = 0;
  const changedPaths: string[] = [];

  for (const item of items) {
    const relPath = itemPath(item);
    const fullPath = join(vaultPath, relPath);
    if (existsSync(fullPath)) {
      appendFileSync(fullPath, buildAppendEntry(dailyRelPath, item), "utf-8");
      updated++;
    } else {
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, buildNewNote(date, dailyRelPath, item), "utf-8");
      created++;
    }
    changedPaths.push(relPath);
  }

  const linkedDaily = applyLinks(dailyContent, items);
  const linked = countAddedLinks(dailyContent, linkedDaily);
  if (linkedDaily !== dailyContent) {
    writeFileSync(dailyPath, linkedDaily, "utf-8");
  }

  const reportRelPath = `analysis/organize-${date}.md`;
  const reportPath = join(vaultPath, reportRelPath);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, buildReport(date, dailyRelPath, items, changedPaths, created, updated, linked), "utf-8");

  return {
    scanned: 1,
    created,
    updated,
    linked,
    reportPath: reportRelPath,
    message: buildMessage(items, changedPaths, created, updated, linked, reportRelPath),
  };
}

function normalizeItems(items: KnowledgeItem[]): KnowledgeItem[] {
  const seen = new Set<string>();
  const normalized: KnowledgeItem[] = [];

  for (const item of items) {
    const title = item.title?.trim();
    const sourceText = item.sourceText?.trim();
    if (!title || !sourceText || !isKnowledgeCategory(item.category)) continue;

    const key = `${item.category}:${title}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      category: item.category,
      title,
      summary: item.summary?.trim() || sourceText,
      sourceText,
      tags: [...new Set((item.tags || []).map((tag) => tag.trim()).filter(Boolean))],
    });
  }

  return normalized;
}

function isKnowledgeCategory(category: string): category is KnowledgeCategory {
  return ["people", "companies", "concepts", "sources", "projects", "analysis"].includes(category);
}

function itemPath(item: KnowledgeItem): string {
  return `${item.category}/${toFileName(item.title)}.md`;
}

function toFileName(title: string): string {
  return title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildNewNote(date: string, dailyRelPath: string, item: KnowledgeItem): string {
  const tags = formatTags(item.tags || []);
  return [
    "---",
    `type: ${item.category}`,
    `date: ${date}`,
    `source: ${dailyRelPath}`,
    `tags: ${tags}`,
    "---",
    "",
    `# ${item.title}`,
    "",
    item.summary,
    "",
  ].join("\n");
}

function buildAppendEntry(dailyRelPath: string, item: KnowledgeItem): string {
  return [
    "",
    `## ${todayDate()}`,
    "",
    `source: ${dailyRelPath}`,
    "",
    item.summary,
    "",
  ].join("\n");
}

function formatTags(tags: string[]): string {
  if (tags.length === 0) return "[]";
  return `[${tags.map((tag) => `"${tag.replace(/"/g, '\\"')}"`).join(", ")}]`;
}

function applyLinks(content: string, items: KnowledgeItem[]): string {
  let next = content;
  for (const item of items) {
    const target = toFileName(item.title);
    const link = target === item.title ? `[[${target}]]` : `[[${target}|${item.title}]]`;
    if (next.includes(link) || !next.includes(item.sourceText)) continue;
    next = next.replace(item.sourceText, link);
  }
  return next;
}

function countAddedLinks(before: string, after: string): number {
  return Math.max(0, (after.match(/\[\[/g) || []).length - (before.match(/\[\[/g) || []).length);
}

function buildReport(
  date: string,
  dailyRelPath: string,
  items: KnowledgeItem[],
  changedPaths: string[],
  created: number,
  updated: number,
  linked: number
): string {
  const lines = [
    "---",
    "type: organize-report",
    `date: ${date}`,
    `source: ${dailyRelPath}`,
    "---",
    "",
    `# ${date} 整理报告`,
    "",
    `扫描 1 篇 daily，新建 ${created} 篇，更新 ${updated} 篇，建立 ${linked} 个链接。`,
    "",
    "## 分流结果",
    "",
  ];

  if (items.length === 0) {
    lines.push("没有识别到需要分流的内容。");
  } else {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      lines.push(`${i + 1}. ${CATEGORY_LABELS[item.category]}: [[${toFileName(item.title)}|${item.title}]]`);
      lines.push(`   - 文件: ${changedPaths[i]}`);
      lines.push(`   - 摘要: ${item.summary}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildMessage(
  items: KnowledgeItem[],
  changedPaths: string[],
  created: number,
  updated: number,
  linked: number,
  reportRelPath: string
): string {
  const lines = [
    `整理完成：新建 ${created} 篇，更新 ${updated} 篇，建立 ${linked} 个链接`,
    "",
    `报告：${reportRelPath}`,
  ];

  if (items.length > 0) {
    lines.push("", "分流：");
    for (let i = 0; i < Math.min(items.length, 10); i++) {
      const item = items[i];
      lines.push(`- ${CATEGORY_LABELS[item.category]} ${item.title} -> ${changedPaths[i]}`);
    }
  }

  return lines.join("\n");
}

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
