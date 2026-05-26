import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { organizeDailyInbox, type KnowledgeItem } from "./inbox-organizer";

const tempVaults: string[] = [];

function createVault(): string {
  const vault = mkdtempSync(join(tmpdir(), "brain-bot-inbox-"));
  tempVaults.push(vault);
  return vault;
}

afterEach(() => {
  for (const vault of tempVaults.splice(0)) {
    rmSync(vault, { recursive: true, force: true });
  }
});

test("organizeDailyInbox splits daily notes into category files and writes a report", async () => {
  const vault = createVault();
  const dailyDir = join(vault, "daily");
  mkdirSync(dailyDir, { recursive: true });
  writeFileSync(
    join(dailyDir, "2026-05-26.md"),
    [
      "---",
      "type: daily",
      "date: 2026-05-26",
      "tags: []",
      "---",
      "",
      "# 2026-05-26",
      "",
      "今天和张三聊了 brain-bot，他建议先做 daily 自动整理。",
      "看到一篇文章讲 AI Agent 长期记忆，适合放进项目知识库。",
    ].join("\n"),
    "utf-8"
  );

  const items: KnowledgeItem[] = [
    {
      category: "people",
      title: "张三",
      summary: "聊过 brain-bot 的 daily 自动整理。",
      sourceText: "张三",
      tags: ["人脉", "brain-bot"],
    },
    {
      category: "projects",
      title: "brain-bot",
      summary: "飞书入口 + Obsidian 长期记忆的工具。",
      sourceText: "brain-bot",
      tags: ["项目", "知识库"],
    },
    {
      category: "concepts",
      title: "AI Agent 长期记忆",
      summary: "把 Obsidian 当成 agent 的长期知识库。",
      sourceText: "AI Agent 长期记忆",
      tags: ["AI", "长期记忆"],
    },
  ];

  const result = await organizeDailyInbox(vault, {
    date: "2026-05-26",
    extractItems: async () => items,
  });

  expect(result.created).toBe(3);
  expect(result.updated).toBe(0);
  expect(result.linked).toBe(3);
  expect(existsSync(join(vault, "people", "张三.md"))).toBe(true);
  expect(existsSync(join(vault, "projects", "brain-bot.md"))).toBe(true);
  expect(existsSync(join(vault, "concepts", "AI-Agent-长期记忆.md"))).toBe(true);

  const daily = readFileSync(join(vault, "daily", "2026-05-26.md"), "utf-8");
  expect(daily).toContain("[[张三]]");
  expect(daily).toContain("[[brain-bot]]");
  expect(daily).toContain("[[AI-Agent-长期记忆|AI Agent 长期记忆]]");

  const project = readFileSync(join(vault, "projects", "brain-bot.md"), "utf-8");
  expect(project).toContain("飞书入口 + Obsidian 长期记忆的工具。");
  expect(project).toContain("source: daily/2026-05-26.md");

  const report = readFileSync(join(vault, "analysis", "organize-2026-05-26.md"), "utf-8");
  expect(report).toContain("新建 3 篇");
  expect(report).toContain("people/张三.md");
  expect(result.message).toContain("整理完成");
});
