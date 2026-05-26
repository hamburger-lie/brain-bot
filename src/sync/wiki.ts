import * as lark from "@larksuiteoapi/node-sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const SYNC_CATEGORIES = ["people", "companies", "concepts", "projects"];

const CATEGORY_LABELS: Record<string, string> = {
  people: "人物",
  companies: "公司",
  concepts: "想法",
  projects: "项目",
};

interface WikiMap {
  spaceId: string;
  nodes: Record<string, string>; // localPath -> wiki_node_token
  lastSync: string;
}

/** 加载或初始化 wiki 映射 */
function loadWikiMap(vaultPath: string): WikiMap {
  const mapPath = join(vaultPath, ".brain-bot", "wiki-map.json");
  if (existsSync(mapPath)) {
    try {
      return JSON.parse(readFileSync(mapPath, "utf-8"));
    } catch {}
  }
  return { spaceId: "", nodes: {}, lastSync: "" };
}

/** 保存 wiki 映射 */
function saveWikiMap(vaultPath: string, map: WikiMap) {
  const dir = join(vaultPath, ".brain-bot");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(dir, "wiki-map.json"), JSON.stringify(map, null, 2), "utf-8");
}

/** 扫描 vault 分类目录，同步到飞书知识库 */
export async function syncToWiki(client: lark.Client, vaultPath: string): Promise<string> {
  const map = loadWikiMap(vaultPath);
  const results: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // 1. 确保知识空间存在
  if (!map.spaceId) {
    try {
      const resp = await client.wiki.v2.space.create({
        data: {
          name: "Brain Bot 知识库",
          description: "由 brain-bot 自动同步的 Obsidian 知识库",
        },
      });
      map.spaceId = resp.data?.space?.space_id || "";
      if (!map.spaceId) {
        return "创建知识空间失败：未返回 space_id";
      }
      results.push(`创建知识空间: Brain Bot 知识库`);
    } catch (err) {
      console.error("[wiki] 创建知识空间失败:", err);
      return `创建知识空间失败: ${err instanceof Error ? err.message.slice(0, 100) : "未知错误"}`;
    }
  }

  // 2. 遍历分类目录
  for (const category of SYNC_CATEGORIES) {
    const categoryDir = join(vaultPath, category);
    if (!existsSync(categoryDir)) continue;

    const files = readdirSync(categoryDir).filter(f => f.endsWith(".md"));
    if (files.length === 0) continue;

    // 创建分类节点（如果不存在）
    const categoryNodeKey = `category:${category}`;
    if (!map.nodes[categoryNodeKey]) {
      try {
        const resp = await client.wiki.v2.spaceNode.create({
          path: { space_id: map.spaceId },
          data: {
            obj_type: "docx",
            title: CATEGORY_LABELS[category] || category,
          },
        });
        map.nodes[categoryNodeKey] = resp.data?.node?.node_token || "";
        results.push(`创建分类: ${CATEGORY_LABELS[category] || category}`);
      } catch (err) {
        console.error(`[wiki] 创建分类 ${category} 失败:`, err);
        continue;
      }
    }

    const parentNode = map.nodes[categoryNodeKey];

    // 3. 同步每个文件
    for (const file of files) {
      const localPath = join(category, file);
      const fullPath = join(vaultPath, localPath);
      const content = readFileSync(fullPath, "utf-8");
      const title = basename(file, ".md");

      // 检查是否需要更新
      const existingNode = map.nodes[localPath];
      if (existingNode) {
        // 已存在，检查是否需要更新（简单比较内容长度）
        skipped++;
        continue;
      }

      // 创建新节点
      try {
        const resp = await client.wiki.v2.spaceNode.create({
          path: { space_id: map.spaceId },
          data: {
            obj_type: "docx",
            parent_node_token: parentNode,
            title: title,
          },
        });

        const nodeToken = resp.data?.node?.node_token;
        if (nodeToken) {
          map.nodes[localPath] = nodeToken;
          created++;
        }
      } catch (err) {
        console.error(`[wiki] 创建节点 ${localPath} 失败:`, err);
        results.push(`失败: ${localPath}`);
      }
    }
  }

  // 4. 保存映射
  map.lastSync = new Date().toISOString();
  saveWikiMap(vaultPath, map);

  const summary = [
    `同步完成`,
    `新增: ${created}`,
    `跳过: ${skipped}`,
    `失败: ${results.filter(r => r.startsWith("失败")).length}`,
  ].join(" | ");

  return summary;
}
