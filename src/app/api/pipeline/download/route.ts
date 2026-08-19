import { spawn } from "child_process";
import { existsSync, readdirSync, mkdirSync, rmSync } from "fs";
import path from "path";
import { getCredentials } from "@/lib/server-credentials";
import { appendPipelineLog } from "@/lib/log-file";
import { safeEnqueue, safeClose } from "@/lib/sse";

function dateTag(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function spawnStream(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  send: (type: string, msg: string) => void,
  onLine?: (line: string) => void
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env });
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      send("log", chunk.toString());
      if (!onLine) return;
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => send("error", chunk.toString()));
    child.on("close", (code) => {
      if (buffer && onLine) onLine(buffer);
      resolve(code ?? 1);
    });
    child.on("error", (err) => { send("error", err.message); resolve(1); });
  });
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");
  const { jiraUser, whitegenCookie, whitegenAuth } = getCredentials(request);

  const outputDir = path.join(genAutoDir, `генератор_${dateTag()}`);
  mkdirSync(outputDir, { recursive: true });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, message: string) => {
        appendPipelineLog("download", type, message, jiraUser);
        const lines = message.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type, message: line })}\n\n`);
        }
      };

      // ── Step 1: Download ZIPs into outputDir ──────────────────────
      send("log", `━━━ Скачивание → ${path.basename(outputDir)} ━━━━━━━━━━━━━━━━━━━━━`);
      const newlySaved: string[] = [];
      const dlCode = await spawnStream(
        process.execPath,
        [path.join(genAutoDir, "test-download.js")],
        genAutoDir,
        {
          ...process.env,
          FORCE_COLOR: "0",
          GEN_DIR: outputDir,
          ...(jiraUser && { JIRA_USER: jiraUser }),
          ...(whitegenCookie && { WHITEGEN_COOKIE: whitegenCookie }),
          ...(whitegenAuth && { WHITEGEN_AUTH: whitegenAuth }),
        },
        send,
        (line) => {
          const m = line.match(/^Saved: (.+)$/);
          if (m) newlySaved.push(path.basename(m[1].trim()));
        }
      );
      if (dlCode !== 0) {
        send("error", `Скачивание завершилось с ошибкой (код ${dlCode})`);
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "done", code: dlCode })}\n\n`);
        safeClose(controller);
        return;
      }

      // ── Step 2: только реально свежескачанные ZIP — не всё, что лежит
      // в outputDir с прошлых запусков ──────────────────────────────
      const existingZips = new Set(readdirSync(outputDir).filter((f) => f.endsWith(".zip")));
      const zips = newlySaved.filter((f) => existingZips.has(f));

      if (zips.length === 0) {
        send("log", "Нет новых ZIP-архивов для распаковки.");
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "extracted-keys", keys: [] })}\n\n`);
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "done", code: 0 })}\n\n`);
        safeClose(controller);
        return;
      }

      // ── Step 3: Extract ZIPs in place ────────────────────────────
      send("log", `\n━━━ Распаковка (${zips.length} архивов) ━━━━━━━━━━━━━━━━━━━━━`);

      const extractedKeys: string[] = [];
      for (const zip of zips) {
        const taskKey = zip.replace(/\.zip$/i, "");
        const zipPath = path.join(outputDir, zip);
        const extractDir = path.join(outputDir, taskKey);
        // если задачу перегенерировали и скачали второй раз за день — сносим
        // старую распаковку, иначе файлы, которых нет в новой версии,
        // останутся от старой (и уедут в деплой, и попадут в архив Я.Диска)
        if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true });
        mkdirSync(extractDir, { recursive: true });

        send("log", `📦 ${zip}`);
        await spawnStream("unzip", ["-o", "-q", zipPath, "-d", extractDir], genAutoDir, { ...process.env }, send);
        send("log", `   ✓ распакован → ${taskKey}`);
        extractedKeys.push(taskKey);
      }

      send("log", `\n✅ Готово. Папка: ${path.basename(outputDir)}`);
      safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "extracted-keys", keys: extractedKeys })}\n\n`);
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
