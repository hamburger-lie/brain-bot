import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeNotes } from "../ai";

/** 今天的日期 */
function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 获取 N 天前的日期 */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 生成知识摘要 */
export async function generateSummary(vaultPath: string, period?: string): Promise<string> {
  // 解析时间范围
  let days = 7;
  let periodLabel = "本周";

  if (period) {
    const p = period.trim().toLowerCase();
    if (p.includes("今") || p.includes("today") || p === "日") {
      days = 1;
      periodLabel = "今日";
    } else if (p.includes("周") || p.includes("week")) {
      days = 7;
      periodLabel = "本周";
    } else if (p.includes("月") || p.includes("month")) {
      days = 30;
      periodLabel = "本月";
    } else {
      const num = parseInt(p);
      if (!isNaN(num) && num > 0 && num <= 90) {
        days = num;
        periodLabel = `近${num}天`;
      }
    }
  }

  // 收集时间范围内的笔记
  const notes = collectNotes(vaultPath, days);

  if (notes.length === 0) {
    return `${periodLabel}没有找到笔记`;
  }

  try {
    // 调用 AI 生成摘要
    const summary = await summarizeNotes(notes, periodLabel);

    // 保存摘要到文件
    const summaryDir = join(vaultPath, "summaries");
    if (!existsSync(summaryDir)) {
      mkdirSync(summaryDir, { recursive: true });
    }

    const summaryFile = join(summaryDir, `${todayDate()}-${periodLabel}.md`);
    const header = [
      "---",
      "type: summary",
      `date: ${todayDate()}`,
      `period: ${periodLabel}`,
      `notes_count: ${notes.length}`,
      "---",
      "",
      `# ${periodLabel}知识摘要`,
      "",
      `> 基于 ${notes.length} 篇笔记自动生成`,
      "",
    ].join("\n");

    writeFileSync(summaryFile, header + summary, "utf-8");

    return `${periodLabel}摘要已生成（基于 ${notes.length} 篇笔记）\n\n${summary}`;
  } catch (err) {
    console.error("[摘要] 生成失败:", err);
    return `摘要生成失败: ${err instanceof Error ? err.message : "未知错误"}`;
  }
}

/** 收集指定天数内的笔记 */
function collectNotes(vaultPath: string, days: number): { path: string; content: string }[] {
  const cutoff = daysAgo(days);
  const dirs = ["daily", "people", "companies", "concepts", "projects"];
  const notes: { path: string; content: string }[] = [];

  for (const dir of dirs) {
    const dirPath = join(vaultPath, dir);
    if (!existsSync(dirPath)) continue;

    for (const file of readdirSync(dirPath)) {
      if (!file.endsWith(".md")) continue;

      // 日记按日期过滤
      if (dir === "daily") {
        const fileDate = file.replace(".md", "");
        if (fileDate < cutoff) continue;
      }

      const fullPath = join(dirPath, file);
      const content = readFileSync(fullPath, "utf-8");

      // 检查 frontmatter 中的日期
      const dateMatch = content.match(/date:\s*(\d{4}-\d{2}-\d{2})/);
      if (dateMatch && dateMatch[1] < cutoff) continue;

      notes.push({ path: `${dir}/${file}`, content });
    }
  }

  return notes;
}
