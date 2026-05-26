import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateTags, findLinks, suggestWikilinks } from "../ai";

/** 今天的日期 */
function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 整理今日笔记：自动打标签 + 建双向链接 */
export async function organizeNotes(vaultPath: string, target?: string): Promise<string> {
  const results: string[] = [];

  // 确定要整理的文件
  const filesToOrganize = target
    ? [resolveTargetFile(vaultPath, target)]
    : getTodayFiles(vaultPath);

  if (filesToOrganize.length === 0) {
    return "没有找到需要整理的笔记";
  }

  // 加载所有现有笔记（用于关联分析）
  const allNotes = loadAllNotes(vaultPath);
  const allTitles = allNotes.map((n) => n.title);

  let organized = 0;

  for (const filePath of filesToOrganize) {
    if (!filePath || !existsSync(filePath)) continue;

    const content = readFileSync(filePath, "utf-8");
    const relPath = filePath.replace(vaultPath, "").replace(/^[\\/]/, "").replace(/\\/g, "/");

    // 跳过 frontmatter
    const bodyContent = content.replace(/^---[\s\S]*?---\n*/, "").trim();
    if (bodyContent.length < 10) continue;

    try {
      let modified = false;
      let newContent = content;

      // 1. 自动打标签
      const existingTags = extractExistingTags(content);
      if (existingTags.length === 0) {
        const tags = await generateTags(bodyContent);
        if (tags.length > 0) {
          newContent = addTagsToFrontmatter(newContent, tags);
          modified = true;
          results.push(`${relPath}: +标签 [${tags.join(", ")}]`);
        }
      }

      // 2. 自动建双向链接
      const wikilinks = await suggestWikilinks(bodyContent, allTitles);
      if (wikilinks.length > 0) {
        for (const { original, link } of wikilinks) {
          // 避免重复添加链接
          if (!newContent.includes(`[[${link}]]`) && newContent.includes(original)) {
            newContent = newContent.replace(original, `[[${link}]]`);
            modified = true;
          }
        }
        if (modified) {
          results.push(`${relPath}: +链接 ${wikilinks.map((w) => `[[${w.link}]]`).join(", ")}`);
        }
      }

      // 3. 保存修改
      if (modified) {
        writeFileSync(filePath, newContent, "utf-8");
        organized++;
      }
    } catch (err) {
      console.error(`[整理] 处理 ${relPath} 失败:`, err);
      results.push(`${relPath}: 整理失败`);
    }
  }

  if (organized === 0) {
    return "笔记已经整理好了，没有需要更新的内容";
  }

  return `整理完成，更新了 ${organized} 篇笔记\n\n${results.join("\n")}`;
}

/** 解析目标文件路径 */
function resolveTargetFile(vaultPath: string, target: string): string | null {
  const clean = target.replace(/\\/g, "/").replace(/^\//, "");
  const fullPath = join(vaultPath, clean);
  if (existsSync(fullPath)) return fullPath;

  // 尝试加 .md 后缀
  const withExt = fullPath.endsWith(".md") ? fullPath : fullPath + ".md";
  if (existsSync(withExt)) return withExt;

  return null;
}

/** 获取今日修改过的文件 */
function getTodayFiles(vaultPath: string): string[] {
  const today = todayDate();
  const dirs = ["daily", "people", "companies", "concepts", "projects"];
  const files: string[] = [];

  for (const dir of dirs) {
    const dirPath = join(vaultPath, dir);
    if (!existsSync(dirPath)) continue;

    for (const file of readdirSync(dirPath)) {
      if (!file.endsWith(".md")) continue;
      // 日记按日期命名，其他文件全部扫描
      if (dir === "daily" && !file.startsWith(today)) continue;
      files.push(join(dirPath, file));
    }
  }

  return files;
}

/** 加载所有笔记 */
function loadAllNotes(vaultPath: string): { path: string; title: string; content: string }[] {
  const dirs = ["people", "companies", "concepts", "projects"];
  const notes: { path: string; title: string; content: string }[] = [];

  for (const dir of dirs) {
    const dirPath = join(vaultPath, dir);
    if (!existsSync(dirPath)) continue;

    for (const file of readdirSync(dirPath)) {
      if (!file.endsWith(".md")) continue;
      const fullPath = join(dirPath, file);
      const content = readFileSync(fullPath, "utf-8");
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : file.replace(".md", "");
      notes.push({ path: `${dir}/${file}`, title, content });
    }
  }

  return notes;
}

/** 提取已有标签 */
function extractExistingTags(content: string): string[] {
  const match = content.match(/tags:\s*\[([^\]]*)\]/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((t) => t.trim().replace(/"/g, ""))
    .filter(Boolean);
}

/** 在 frontmatter 中添加标签 */
function addTagsToFrontmatter(content: string, tags: string[]): string {
  const tagsStr = tags.map((t) => `"${t}"`).join(", ");

  if (content.includes("tags: []")) {
    return content.replace("tags: []", `tags: [${tagsStr}]`);
  }

  if (content.match(/tags:\s*\[/)) {
    return content.replace(/tags:\s*\[([^\]]*)\]/, (match, existing) => {
      const merged = existing.trim() ? `${existing}, ${tagsStr}` : tagsStr;
      return `tags: [${merged}]`;
    });
  }

  // 没有 tags 字段，在 frontmatter 末尾添加
  return content.replace("---\n", `tags: [${tagsStr}]\n---\n`);
}
