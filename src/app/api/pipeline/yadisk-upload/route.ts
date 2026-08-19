import { readdirSync, statSync } from "fs";
import path from "path";
import { getCredentials } from "@/lib/server-credentials";
import { uploadTaskFoldersToYandexDisk } from "@/services/yadisk.service";
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
  const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");
  const { jiraUser, yandexDiskToken } = getCredentials(request);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, message: string) => {
        appendPipelineLog("yadisk-upload", type, message, jiraUser);
        const lines = message.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type, message: line })}\n\n`);
        }
      };
      const done = (code: number) => {
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "done", code })}\n\n`);
        safeClose(controller);
      };

      if (!yandexDiskToken) {
        send("error", "Не задан токен Яндекс.Диска — добавьте его в настройках");
        done(1);
        return;
      }

      const genDir = findLatestGenDir(genAutoDir);
      if (!genDir) {
        send("error", "Папка генератора не найдена");
        done(1);
        return;
      }

      send("log", `━━━ Загрузка на Яндекс.Диск → Генератор ━━━━━━━━━━━━━━━━━━━━━`);
      send("log", `Папка: ${path.basename(genDir)}`);

      try {
        const result = await uploadTaskFoldersToYandexDisk(yandexDiskToken, genDir, (line) => send("log", line), 1);
        send("log", `\n✅ Загружено папок: ${result.folders}, файлов: ${result.files}`);
        if (result.errors.length > 0) {
          for (const e of result.errors) send("error", `${e.taskKey}: ${e.error}`);
          done(1);
          return;
        }
        done(0);
      } catch (err) {
        send("error", err instanceof Error ? err.message : String(err));
        done(1);
      }
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
