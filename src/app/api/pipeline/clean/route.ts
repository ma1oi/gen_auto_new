import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { runLuckyCleanerOnDir } from "@/services/lucky-cleaner.service";
import { appendPipelineLog } from "@/lib/log-file";
import { getCredentials } from "@/lib/server-credentials";
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
  const genAutoDir = path.join(process.cwd(), "gen_auto");
  const { jiraUser } = getCredentials(request);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, message: string) => {
        appendPipelineLog("clean", type, message, jiraUser);
        const lines = message.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type, message: line })}\n\n`);
        }
      };

      const genDir = findLatestGenDir(genAutoDir);
      if (!genDir) {
        send("error", "Папка генератора не найдена");
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "done", code: 1 })}\n\n`);
        safeClose(controller);
        return;
      }

      send("log", `━━━ Lucky Cleaner ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      send("log", `Папка: ${path.basename(genDir)}`);

      const folders = readdirSync(genDir).filter(
        (f) => !f.startsWith(".") && statSync(path.join(genDir, f)).isDirectory()
      );

      for (const folder of folders) {
        const folderPath = path.join(genDir, folder);
        send("log", `\n🧹 ${folder}`);
        try {
          runLuckyCleanerOnDir(folderPath, (line) => send("log", `   ${line}`));
        } catch (err) {
          send("error", `   ошибка: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      send("log", `\n✅ Очистка завершена`);
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
