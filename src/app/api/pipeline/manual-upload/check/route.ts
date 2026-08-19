import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getCredentials } from "@/lib/server-credentials";
import { appendPipelineLog } from "@/lib/log-file";

type CheckResult = { results?: Record<string, boolean | { error: string }>; error?: string };

function checkExisting(ip: string, names: string[], serverLogin: string, serverPassword: string): Promise<CheckResult> {
  return new Promise((resolve) => {
    const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");
    const child = spawn("python3", ["manual_upload_check.py", ip, ...names], {
      cwd: genAutoDir,
      env: { ...process.env, SERVER_LOGIN: serverLogin, SERVER_PASSWORD: serverPassword },
    });

    let out = "";
    let errOut = "";
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { errOut += chunk.toString(); });
    child.on("close", () => {
      try {
        resolve(JSON.parse(out.trim()));
      } catch {
        // stdout не JSON — обычно значит, что скрипт упал раньше первого
        // print() (например ModuleNotFoundError при отсутствующей зависимости
        // на сервере) и traceback ушёл в stderr, а не в stdout
        const detail = errOut.trim() || out.trim() || "пустой ответ";
        resolve({ error: `manual_upload_check.py: не удалось разобрать ответ — ${detail}` });
      }
    });
    child.on("error", (err) => resolve({ error: err.message }));
  });
}

export async function POST(request: Request) {
  const { jiraUser, serverLogin, serverPassword } = getCredentials(request);
  const { ip, names } = (await request.json()) as { ip: string; names: string[] };

  if (!ip || !names?.length) {
    return NextResponse.json({ error: "ip и names обязательны" }, { status: 400 });
  }
  if (!serverLogin || !serverPassword) {
    return NextResponse.json({ error: "нет доступов к серверу — заполните Сервер в настройках" }, { status: 400 });
  }

  const result = await checkExisting(ip, names, serverLogin, serverPassword);
  if (result.error) {
    appendPipelineLog("manual-upload/check", "error", `${ip} (${names.join(", ")}): ${result.error}`, jiraUser);
  }
  return NextResponse.json(result);
}
