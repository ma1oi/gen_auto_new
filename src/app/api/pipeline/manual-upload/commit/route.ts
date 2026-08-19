import { spawn } from "child_process";
import path from "path";
import { getCredentials } from "@/lib/server-credentials";
import { purgeCacheDomains } from "@/services/cache-purge.service";
import { appendPipelineLog } from "@/lib/log-file";
import { safeEnqueue, safeClose } from "@/lib/sse";

interface CommitItem {
  name: string;
  mode: "overwrite" | "backup";
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const { jiraUser, serverLogin, serverPassword } = getCredentials(request);
  const { ip, stagedDir, items } = (await request.json()) as {
    ip: string;
    stagedDir: string;
    items: CommitItem[];
  };

  const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");

  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, message: string) => {
        appendPipelineLog("manual-upload/commit", type, message, jiraUser);
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type, message })}\n\n`);
      };
      // stagedDir — это gen_auto/ручники_DD-MM-YYYY/, постоянный 7-дневный
      // архив (его показывает вкладка "Я.Диск"), поэтому в отличие от
      // остальных пайплайнов мы НЕ удаляем его после заливки на сервер.
      const done = (code: number) => {
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "done", code })}\n\n`);
        safeClose(controller);
      };

      if (!ip || !stagedDir || !items?.length) {
        send("error", "ip, stagedDir и items обязательны");
        done(1);
        return;
      }
      if (!serverLogin || !serverPassword) {
        send("error", "нет доступов к серверу — заполните Сервер в настройках");
        done(1);
        return;
      }

      const args = items.map((i) => `${i.name}:${i.mode}`);
      const child = spawn("python3", ["manual_upload_deploy.py", ip, stagedDir, ...args], {
        cwd: genAutoDir,
        env: { ...process.env, SERVER_LOGIN: serverLogin, SERVER_PASSWORD: serverPassword, FORCE_COLOR: "0" },
      });

      const deployedDomains: string[] = [];
      let errorCount = 0;
      child.stdout.on("data", (chunk: Buffer) => {
        chunk.toString().split("\n").filter(Boolean).forEach((line) => {
          if (/\[ERR\]|\[!\]/.test(line)) {
            errorCount++;
            send("error", line);
          } else {
            send("log", line);
          }
          const m = line.match(/\[OK\]\s+(\S+)/);
          if (m) deployedDomains.push(m[1]);
        });
      });
      child.stderr.on("data", (chunk: Buffer) => {
        errorCount++;
        send("error", chunk.toString());
      });
      child.on("close", async (code) => {
        const effectiveCode = code === 0 && errorCount > 0 ? 1 : code ?? 1;
        if (effectiveCode === 0 && deployedDomains.length > 0) {
          safeEnqueue(
            controller,
            encoder,
            `data: ${JSON.stringify({ type: "deployed-domains", domains: deployedDomains })}\n\n`
          );
          send("log", `Очищаю кэш для доменов: ${deployedDomains.join(", ")}`);
          try {
            const result = await purgeCacheDomains(deployedDomains);
            if (result.ok) {
              send("log", `Кэш очищен (${result.status}): ${result.body}`);
            } else {
              send("error", `Ошибка очистки кэша (${result.status}): ${result.body}`);
            }
          } catch (err) {
            send("error", `Ошибка очистки кэша: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        done(effectiveCode);
      });
      child.on("error", (err) => {
        send("error", err.message);
        done(1);
      });
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
