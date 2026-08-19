import { existsSync, readdirSync, rmSync, statSync } from "fs";
import path from "path";
import { getCredentials } from "@/lib/server-credentials";
import { appendPipelineLog } from "@/lib/log-file";
import { safeEnqueue, safeClose } from "@/lib/sse";

function findLatestGenDir(genAutoDir: string): string | null {
  const parseDate = (name: string): number => {
    const m = name.match(/генератор_(\d{2})-(\d{2})-(\d{4})/);
    if (!m) return 0;
    return new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();
  };
  const entries = readdirSync(genAutoDir)
    .filter((f) => f.startsWith("генератор_") && statSync(path.join(genAutoDir, f)).isDirectory())
    .sort((a, b) => parseDate(b) - parseDate(a));
  return entries.length > 0 ? path.join(genAutoDir, entries[0]) : null;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const { keys } = (await request.json()) as { keys: string[] };
  const genAutoDir = path.join(process.cwd(), "gen_auto");
  const { jiraUser, whitegenAuth: WHITEGEN_AUTH, whitegenCookie: WHITEGEN_COOKIE } = getCredentials(request);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, message: string) => {
        appendPipelineLog("regenerate", type, message, jiraUser);
        const lines = message.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type, message: line })}\n\n`);
        }
      };

      send("log", `━━━ Перегенерация (${keys.length} задач) ━━━━━━━━━━━━━━━━━━━━━`);

      const headers: Record<string, string> = {
        accept: "application/json",
        authorization: WHITEGEN_AUTH,
        "content-type": "application/json",
        cookie: WHITEGEN_COOKIE,
        Referer: "https://whitegen.org/dashboard",
      };

      // Find whitegen task IDs for the given keys
      const needed = new Set(keys);
      const items: { id: number; number: string }[] = [];
      let page = 1;

      while (needed.size > 0) {
        const res = await fetch(
          `https://whitegen.org/api/v1/generator/list?page=${page}&per_page=20`,
          { headers }
        );
        if (!res.ok) break;
        const data = (await res.json()) as { data?: { id: number; number: string }[] };
        const batch = data.data ?? [];
        if (batch.length === 0) break;
        for (const item of batch) {
          if (needed.has(item.number)) {
            items.push(item);
            needed.delete(item.number);
          }
        }
        if (batch.length < 20) break;
        page++;
      }

      if (needed.size > 0) {
        send("error", `Не найдены в whitegen: ${[...needed].join(", ")}`);
      }

      // Trigger regeneration with delay
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        send("log", `🔄 ${item.number} (id=${item.id})...`);
        try {
          const res = await fetch(
            `https://whitegen.org/api/v1/generator/${item.id}/regenerate`,
            { method: "POST", headers }
          );
          if (res.ok) {
            send("log", `   ✓ Перегенерация запущена`);
          } else {
            send("error", `   ✗ HTTP ${res.status} — проверьте вручную`);
          }
        } catch (err) {
          send("error", `   ✗ ${err instanceof Error ? err.message : String(err)}`);
        }
        if (i < items.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      // Delete old ZIPs from downloads/
      const downloadsDir = path.join(genAutoDir, "downloads");
      for (const key of keys) {
        const zipPath = path.join(downloadsDir, `${key.toLowerCase()}.zip`);
        if (existsSync(zipPath)) {
          rmSync(zipPath);
          send("log", `🗑  Удалён: ${key.toLowerCase()}.zip`);
        }
      }

      // Delete extracted folders
      const genDir = findLatestGenDir(genAutoDir);
      if (genDir) {
        for (const key of keys) {
          const folderPath = path.join(genDir, key);
          if (existsSync(folderPath)) {
            rmSync(folderPath, { recursive: true });
            send("log", `🗑  Удалена папка: ${key}`);
          }
        }
      }

      send("log", `\n✅ Готово. Дождитесь завершения генерации и скачайте снова.`);
      safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "done", code: 0 })}\n\n`);
      safeClose(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
