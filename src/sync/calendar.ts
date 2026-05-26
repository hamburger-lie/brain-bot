import * as lark from "@larksuiteoapi/node-sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** 今天的日期 YYYY-MM-DD */
function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 时间戳转 HH:MM */
function tsToTime(ts: string): string {
  const d = new Date(Number(ts) * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 同步今日日历和会议到 daily note */
export async function syncCalendar(client: lark.Client, vaultPath: string): Promise<string> {
  const results: string[] = [];

  // 1. 获取今日日程
  try {
    const today = todayDate();
    const startTs = Math.floor(new Date(`${today}T00:00:00`).getTime() / 1000);
    const endTs = Math.floor(new Date(`${today}T23:59:59`).getTime() / 1000);

    const resp = await client.calendar.calendarEvent.list({
      params: {
        start_time: String(startTs),
        end_time: String(endTs),
      },
    });

    const events = resp.data?.items || [];
    if (events.length > 0) {
      const lines = events.map((e: any) => {
        const start = tsToTime(e.start_time?.timestamp || "0");
        const end = tsToTime(e.end_time?.timestamp || "0");
        const summary = e.summary || "(无标题)";
        const location = e.location?.name ? ` @ ${e.location.name}` : "";
        return `- ${start}-${end} ${summary}${location}`;
      });
      results.push(`## 日程\n\n${lines.join("\n")}`);
    } else {
      results.push(`## 日程\n\n今日无日程`);
    }
  } catch (err) {
    console.error("[日历] 获取日程失败:", err);
    results.push(`## 日程\n\n获取失败: ${err instanceof Error ? err.message : "未知错误"}`);
  }

  // 2. 获取会议记录
  try {
    const resp = await client.vc.v1.meeting.list({
      params: {
        start_time: `${todayDate()}T00:00:00`,
        end_time: `${todayDate()}T23:59:59`,
      },
    });

    const meetings = resp.data?.meeting_list || [];
    if (meetings.length > 0) {
      const lines = meetings.map((m: any) => {
        const topic = m.topic || "(无主题)";
        const start = m.start_time ? tsToTime(m.start_time) : "??:??";
        const duration = m.duration ? ` (${Math.round(Number(m.duration) / 60)}分钟)` : "";
        return `- ${start} ${topic}${duration}`;
      });
      results.push(`## 会议纪要\n\n${lines.join("\n")}`);
    } else {
      results.push(`## 会议纪要\n\n今日无会议`);
    }
  } catch (err) {
    console.error("[会议] 获取会议记录失败:", err);
    results.push(`## 会议纪要\n\n获取失败: ${err instanceof Error ? err.message : "未知错误"}`);
  }

  // 3. 写入 daily note
  const content = results.join("\n\n");
  appendToDaily(vaultPath, content);

  return `已同步到 daily/${todayDate()}.md\n${results.length} 个区块更新`;
}

/** 追加内容到今日日记 */
function appendToDaily(vaultPath: string, content: string) {
  const dailyDir = join(vaultPath, "daily");
  if (!existsSync(dailyDir)) {
    mkdirSync(dailyDir, { recursive: true });
  }

  const dailyFile = join(dailyDir, `${todayDate()}.md`);
  const separator = `\n\n---\n\n`;

  if (!existsSync(dailyFile)) {
    const header = `---\ntype: daily\ndate: ${todayDate()}\ntags: []\n---\n\n# ${todayDate()}\n`;
    writeFileSync(dailyFile, header + content, "utf-8");
  } else {
    // 检查是否已经有同步内容，避免重复
    const existing = readFileSync(dailyFile, "utf-8");
    if (!existing.includes("## 日程") && !existing.includes("## 会议纪要")) {
      const { appendFileSync } = require("node:fs");
      appendFileSync(dailyFile, separator + content, "utf-8");
    }
  }
}
