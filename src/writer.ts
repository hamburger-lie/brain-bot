import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ParsedMessage } from "./parser";

/** 生成当前时间的 HH:MM 格式 */
function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 生成今天的日期 */
function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 为新页面生成 frontmatter */
function buildFrontmatter(msg: ParsedMessage): string {
  const typeMap: Record<string, string> = {
    people: "person",
    companies: "company",
    concepts: "concept",
    projects: "project",
    daily: "daily",
  };
  const tagsStr = msg.tags.length > 0
    ? `tags: [${msg.tags.map(t => `"${t}"`).join(", ")}]`
    : "tags: []";
  const lines = [
    "---",
    `type: ${typeMap[msg.category] ?? msg.category}`,
    `date: ${todayDate()}`,
    tagsStr,
    "---",
    "",
  ];
  return lines.join("\n");
}

/** 为新页面生成标题 */
function buildTitle(msg: ParsedMessage): string {
  if (msg.category === "daily") {
    return `# ${todayDate()}\n\n`;
  }
  return `# ${msg.title}\n\n`;
}

/**
 * 写入消息到 vault。
 * - 文件不存在：创建新文件（frontmatter + 标题 + 内容）
 * - 文件已存在：追加内容（带时间戳小标题）
 *
 * 返回写入的文件相对路径。
 */
export function writeToVault(vaultPath: string, msg: ParsedMessage): string {
  const filePath = join(vaultPath, msg.category, `${msg.slug}.md`);
  const dir = dirname(filePath);

  // 确保目录存在
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const time = nowTime();

  if (!existsSync(filePath)) {
    // 新文件
    let body = buildFrontmatter(msg) + buildTitle(msg);
    if (msg.content) {
      body += `${msg.content}\n`;
    }
    writeFileSync(filePath, body, "utf-8");
  } else {
    // 追加到已有文件
    let append = `\n### ${time}\n${msg.content}\n`;
    appendFileSync(filePath, append, "utf-8");
  }

  return `${msg.category}/${msg.slug}.md`;
}
