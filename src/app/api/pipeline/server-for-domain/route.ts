import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getGoogleSheetsRefreshToken } from "@/lib/google-token-cache";
import { appendPipelineLog } from "@/lib/log-file";

const ALLOWED_ORIGIN = "https://jira.lucky-team.pro";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function findServer(domain: string, jiraUser: string): Promise<{ found: boolean; ip?: string; error?: string }> {
  return new Promise((resolve) => {
    const genAutoDir = path.join(process.cwd(), "gen_auto");
    const refreshToken = getGoogleSheetsRefreshToken(jiraUser);
    const child = spawn("python3", ["find_server.py", domain], {
      cwd: genAutoDir,
      env: {
        ...process.env,
        ...(refreshToken && {
          GOOGLE_SHEETS_REFRESH_TOKEN: refreshToken,
          GOOGLE_OAUTH_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
          GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
        }),
      },
    });

    let out = "";
    let errOut = "";
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { errOut += chunk.toString(); });
    child.on("close", () => {
      try {
        resolve(JSON.parse(out.trim()));
      } catch {
        const detail = errOut.trim() || out.trim() || "пустой ответ";
        resolve({ found: false, error: `find_server.py: не удалось разобрать ответ — ${detail}` });
      }
    });
    child.on("error", (err) => resolve({ found: false, error: err.message }));
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain")?.trim() ?? "";
  const jiraUser = searchParams.get("jiraUser")?.trim() ?? "";

  if (!domain) {
    return NextResponse.json({ found: false, error: "domain query param missing" }, { status: 400, headers: corsHeaders() });
  }
  if (!jiraUser) {
    return NextResponse.json(
      { found: false, error: "jiraUser query param missing — обновите код в Tampermonkey из /settings" },
      { status: 400, headers: corsHeaders() }
    );
  }

  const result = await findServer(domain, jiraUser);
  if (result.error) {
    appendPipelineLog("server-for-domain", "error", `${domain}: ${result.error}`, jiraUser);
  }
  return NextResponse.json(result, { headers: corsHeaders() });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
