import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractKnowledgeItems, generateTags, suggestWikilinks } from "../ai";
import { organizeDailyInbox } from "./inbox-organizer";

/** 今天的日期 */
function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 整理今日笔记：自动打标签 + 建双向链接 */
export async function organizeNotes(vaultPath: string, target?: string): Promise<string> {
  console.log(`[整理] 开始，vaultPath=${vaultPath}, target=${target}`);

  const dailyDate = resolveDailyDate(target);
  if (dailyDate) {
    const result = await organizeDailyInbox(vaultPath, {
      date: dailyDate,
      extractItems: extractKnowledgeItems,
    });
    console.log(`[整理] daily 分流完成:`, result);
    return result.message;
  }

  const results: string[] = [];

  // 确定要整理的文件
  const filesToOrganize = target
    ? [resolveTargetFile(vaultPath, target)]
    : getTodayFiles(vaultPath);

  console.log(`[整理] 找到 ${filesToOrganize.length} 个文件:`, filesToOrganize);

  if (filesToOrganize.length === 0) {
    return "没有找到需要整理的笔记";
  }

  // 加载所有现有笔记（用于关联分析）
  const allNotes = loadAllNotes(vaultPath);
  const allTitles = allNotes.map((n) => n.title);
  console.log(`[整理] 加载了 ${allNotes.length} 篇现有笔记`);

  let organized = 0;

  for (const filePath of filesToOrganize) {
    if (!filePath || !existsSync(filePath)) continue;

    const content = readFileSync(filePath, "utf-8");
    const relPath = filePath.replace(vaultPath, "").replace(/^[\\/]/, "").replace(/\\/g, "/");

    // 跳过 frontmatter
    const bodyContent = content.replace(/^---[\s\S]*?---\n*/, "").trim();
    if (bodyContent.length < 10) {
      console.log(`[整理] 跳过 ${relPath}（内容太短）`);
      continue;
    }

    try {
      let modified = false;
      let newContent = content;

      // 1. 自动打标签
      const existingTags = extractExistingTags(content);
      console.log(`[整理] ${relPath} 已有标签:`, existingTags);
      if (existingTags.length === 0) {
        console.log(`[整理] ${relPath} 调用 DeepSeek 生成标签...`);
        const tags = await generateTags(bodyContent);
        console.log(`[整理] ${relPath} 生成标签:`, tags);
        if (tags.length > 0) {
          newContent = addTagsToFrontmatter(newContent, tags);
          modified = true;
          results.push(`${relPath}: +标签 [${tags.join(", ")}]`);
        }
      }

      // 2. 自动建双向链接
      console.log(`[整理] ${relPath} 调用 DeepSeek 分析关联...`);
      const wikilinks = await suggestWikilinks(bodyContent, allTitles);
      const validWikilinks = wikilinks.filter(({ original, link }) =>
        original?.trim() &&
        link?.trim() &&
        allTitles.includes(link.trim()) &&
        link.trim() !== currentTitle(content)
      );
      console.log(`[整理] ${relPath} 建议链接:`, wikilinks);
      if (validWikilinks.length > 0) {
        const linkedContent = applyWikilinksToBody(newContent, validWikilinks);
        let linkModified = false;
        if (linkedContent !== newContent) {
          newContent = linkedContent;
          modified = true;
          linkModified = true;
        }
        if (linkModified) {
          results.push(`${relPath}: +链接 ${validWikilinks.map((w) => `[[${w.link.trim()}]]`).join(", ")}`);
        }
      }

      // 3. 保存修改
      if (modified) {
        writeFileSync(filePath, newContent, "utf-8");
        organized++;
        console.log(`[整理] ${relPath} 已保存`);
      } else {
        console.log(`[整理] ${relPath} 无需修改`);
      }
    } catch (err) {
      console.error(`[整理] 处理 ${relPath} 失败:`, err);
      results.push(`${relPath}: 整理失败`);
    }
  }

  console.log(`[整理] 完成，organized=${organized}`);
  if (organized === 0) {
    return "笔记已经整理好了，没有需要更新的内容";
  }

  return `整理完成，更新了 ${organized} 篇笔记\n\n${results.join("\n")}`;
}

/** 判断 /整理 参数是否指向 daily；无参数默认整理今天 */
function resolveDailyDate(target?: string): string | null {
  if (!target || target.trim() === "" || target.trim() === "今天" || target.trim().toLowerCase() === "today") {
    return todayDate();
  }

  const clean = target.trim().replace(/\\/g, "/");
  const dateMatch = clean.match(/(?:daily\/)?(\d{4}-\d{2}-\d{2})(?:\.md)?$/);
  return dateMatch ? dateMatch[1] : null;
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
      // 跳过模板文件
      if (file.startsWith("_")) continue;
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
      if (file.startsWith("_")) continue; // 跳过模板
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

/** 提取当前笔记标题，用于避免自链接 */
function currentTitle(content: string): string {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : "";
}

/** 只在正文区域添加双向链接，避免污染 frontmatter 和标题 */
function applyWikilinksToBody(content: string, wikilinks: { original: string; link: string }[]): string {
  const match = content.match(/^(---[\s\S]*?---\n*)([\s\S]*)$/);
  const frontmatter = match ? match[1] : "";
  const body = match ? match[2] : content;
  const lines = body.split("\n");
  let inCodeBlock = false;

  const linkedLines = lines.map((line) => {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    if (inCodeBlock || line.startsWith("#")) {
      return line;
    }

    let nextLine = line;
    for (const { original, link } of wikilinks) {
      const cleanOriginal = original.trim();
      const cleanLink = link.trim();
      if (!cleanOriginal || !cleanLink || nextLine.includes(`[[${cleanLink}]]`)) continue;
      nextLine = nextLine.replace(cleanOriginal, `[[${cleanLink}]]`);
    }
    return nextLine;
  });

  return frontmatter + linkedLines.join("\n");
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
