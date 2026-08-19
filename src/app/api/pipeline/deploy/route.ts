import { spawn } from "child_process";
import path from "path";
import { purgeCacheDomains } from "@/services/cache-purge.service";
import { getCredentials } from "@/lib/server-credentials";
import { recordDeployedArchive } from "@/lib/pipeline-db";
import { appendPipelineLog } from "@/lib/log-file";
import { getGoogleSheetsRefreshToken } from "@/lib/google-token-cache";
import { safeEnqueue, safeClose } from "@/lib/sse";

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");
  const { jiraUser, jiraCookie, serverLogin, serverPassword, googleSheetsRefreshToken } = getCredentials(request);
  const effectiveGoogleRefreshToken = googleSheetsRefreshToken || getGoogleSheetsRefreshToken(jiraUser);

  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, payload: Record<string, unknown>) => {
        if (typeof payload.message === "string") appendPipelineLog("deploy", type, payload.message, jiraUser);
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type, ...payload })}\n\n`);
      };

      const deployedDomains: string[] = [];
      let errorCount = 0;

      // Python буферизует stdout, когда он подключён к pipe. Запускаем в
      // unbuffered-режиме, чтобы логи и deploy-status SSE приходили сразу.
      const child = spawn("python3", ["-u", "deploy.py"], {
        cwd: genAutoDir,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          ...(jiraUser && { JIRA_USER: jiraUser }),
          ...(jiraCookie && { JIRA_COOKIE: jiraCookie }),
          ...(serverLogin && { SERVER_LOGIN: serverLogin }),
          ...(serverPassword && { SERVER_PASSWORD: serverPassword }),
          ...(effectiveGoogleRefreshToken && {
            GOOGLE_SHEETS_REFRESH_TOKEN: effectiveGoogleRefreshToken,
            GOOGLE_OAUTH_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
            GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
          }),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const processLine = (line: string) => {
        if (line.startsWith(">>> DEPLOY_QUEUE ")) {
          try {
            const tasks = JSON.parse(line.slice(">>> DEPLOY_QUEUE ".length));
            send("deploy-queue", { tasks });
          } catch { /* ignore malformed marker */ }
          return;
        }
        if (line.startsWith(">>> DEPLOY_STATUS ")) {
          try {
            const status = JSON.parse(line.slice(">>> DEPLOY_STATUS ".length));
            send("deploy-status", status);
            // отдельный архив для вкладки "Я.Диск" — не трогается
            // "Очисткой БД от готовых" на главном экране
            if (status.status === "ok" && status.key && status.domain && jiraUser) {
              recordDeployedArchive(status.key, jiraUser, status.domain);
            }
          } catch { /* ignore malformed marker */ }
          return;
        }

        const isError = /\[ERR\]|\[!\]/.test(line);
        if (isError) {
          errorCount++;
          send("error", { message: line });
        } else {
          send("log", { message: line });
        }
        const m = line.match(/\[OK\]\s+(\S+)/);
        if (m) deployedDomains.push(m[1]);
      };

      // Buffer across "data" events: a single long print() (e.g. the
      // DEPLOY_QUEUE marker for dozens of tasks) can arrive split across
      // multiple stdout chunks, so lines must not be parsed per-chunk.
      let stdoutBuffer = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);

        // input() prompts never end with a newline, so the prompt text
        // stays in the buffer — detect and consume it there.
        if (stdoutBuffer.includes("[1] Запустить")) {
          processLine(stdoutBuffer);
          stdoutBuffer = "";
          child.stdin?.write("1\n");
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        errorCount++;
        send("error", { message: chunk.toString() });
      });
      child.on("close", async (code) => {
        if (stdoutBuffer) {
          processLine(stdoutBuffer);
          stdoutBuffer = "";
        }
        const effectiveCode = (code === 0 && errorCount > 0) ? 1 : code;
        if (effectiveCode === 0 && deployedDomains.length > 0) {
          send("log", { message: `Очищаю кэш для доменов: ${deployedDomains.join(", ")}` });
          try {
            const result = await purgeCacheDomains(deployedDomains);
            if (result.ok) {
              send("log", { message: `Кэш очищен (${result.status}): ${result.body}` });
            } else {
              send("error", { message: `Ошибка очистки кэша (${result.status}): ${result.body}` });
            }
          } catch (err) {
            send("error", { message: `Ошибка очистки кэша: ${err instanceof Error ? err.message : String(err)}` });
          }
        }
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "done", code: effectiveCode })}\n\n`);
        safeClose(controller);
      });
      child.on("error", (err) => {
        send("error", { message: err.message });
        safeClose(controller);
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
