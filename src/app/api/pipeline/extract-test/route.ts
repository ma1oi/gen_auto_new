import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { execFile } from "child_process";
import path from "path";
import { appendPipelineLog } from "@/lib/log-file";
import { getCredentials } from "@/lib/server-credentials";
import { safeEnqueue, safeClose } from "@/lib/sse";

function findOrCreateGenDir(genAutoDir: string): string {
  const parseDate = (name: string): number => {
    const m = name.match(/генератор_(\d{2})-(\d{2})-(\d{4})/);
    if (!m) return 0;
    return new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();
  };
  const entries = readdirSync(genAutoDir)
    .filter((f) => f.startsWith("генератор_") && statSync(path.join(genAutoDir, f)).isDirectory())
    .sort((a, b) => parseDate(b) - parseDate(a));

  if (entries.length > 0) return path.join(genAutoDir, entries[0]);

  const d = new Date();
  const tag = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  const dir = path.join(genAutoDir, `генератор_${tag}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function unzip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("unzip", ["-o", "-q", zipPath, "-d", destDir], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");
  const testDir = path.join(genAutoDir, "test");
  const { jiraUser } = getCredentials(request);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, message: string) => {
        appendPipelineLog("extract-test", type, message, jiraUser);
        for (const line of message.split("\n").filter((l) => l.trim())) {
          safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type, message: line })}\n\n`);
        }
      };

      if (!existsSync(testDir)) {
        send("error", "Папка gen_auto/test/ не найдена");
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "done", code: 1 })}\n\n`);
        safeClose(controller);
        return;
      }

      const zips = readdirSync(testDir).filter((f) => f.toLowerCase().endsWith(".zip"));

      if (zips.length === 0) {
        send("log", "Нет ZIP-архивов в папке test/");
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "done", code: 0 })}\n\n`);
        safeClose(controller);
        return;
      }

      const genDir = findOrCreateGenDir(genAutoDir);
      send("log", `━━━ Извлечение из test/ → ${path.basename(genDir)} (${zips.length} архивов) ━━━`);

      for (const zip of zips) {
        const taskKey = zip.replace(/\.zip$/i, "").toUpperCase();
        const extractDir = path.join(genDir, taskKey);
        mkdirSync(extractDir, { recursive: true });
        send("log", `📦 ${zip}`);
        try {
          await unzip(path.join(testDir, zip), extractDir);
          send("log", `   ✓ → ${taskKey}`);
        } catch (err) {
          send("error", `   ✗ ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      send("log", `\n✅ Готово. Теперь запусти Проверку.`);
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
