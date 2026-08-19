import { existsSync, readdirSync, rmSync, statSync } from "fs";
import path from "path";
import { getCredentials } from "@/lib/server-credentials";
import { getDomain, setDomainIfMissing, resetDeployedAt, markForceRedeploy } from "@/lib/pipeline-db";
import { parseTaskInfo, GEO_TO_LANG } from "@/lib/parse-task-info";
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
  const { keys: rawKeys } = (await request.json()) as { keys: string[] };
  const keys = rawKeys.map((k) => k.toUpperCase());

  const genAutoDir = path.join(process.cwd(), "gen_auto");
  const { jiraCookie: JIRA_COOKIE, jiraUser: JIRA_USER, whitegenCookie: WHITEGEN_COOKIE, whitegenAuth: WHITEGEN_AUTH } =
    getCredentials(request);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, message: string) => {
        appendPipelineLog("resend", type, message, JIRA_USER);
        for (const line of message.split("\n").filter((l) => l.trim())) {
          safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type, message: line })}\n\n`);
        }
      };

      send("log", `━━━ Повторная отправка в генератор (${keys.length} задач) ━━━━━━━━━━━━━━━━━━━━━`);

      const wgHeaders: Record<string, string> = {
        accept: "application/json",
        authorization: WHITEGEN_AUTH,
        "content-type": "application/json",
        cookie: WHITEGEN_COOKIE,
        Referer: "https://whitegen.org/dashboard",
      };

      const jiraHeaders: Record<string, string> = {
        accept: "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/json",
        "cache-control": "no-cache",
        "x-ausername": JIRA_USER,
        "x-requested-with": "XMLHttpRequest",
        cookie: JIRA_COOKIE,
        Referer: "https://jira.lucky-team.pro/secure/RapidBoard.jspa?rapidView=520",
      };

      // Delete old ZIPs and extracted folders from генератор_* directory, and
      // forget any previous deploy — a resent task must go through the full
      // pipeline again (download → check → deploy) as if it were brand new.
      const genDir = findLatestGenDir(genAutoDir);
      for (const key of keys) {
        if (genDir) {
          for (const variant of [key, key.toLowerCase()]) {
            const zipPath = path.join(genDir, `${variant}.zip`);
            if (existsSync(zipPath)) {
              rmSync(zipPath);
              send("log", `🗑  Удалён: ${variant}.zip`);
            }
            const folderPath = path.join(genDir, variant);
            if (existsSync(folderPath)) {
              rmSync(folderPath, { recursive: true });
              send("log", `🗑  Удалена папка: ${variant}`);
            }
          }
        }
        resetDeployedAt(key);
        markForceRedeploy(key);
      }

      send("log", "Загружаем страны и языки...");
      const [countries, languages] = await Promise.all([
        fetch("https://whitegen.org/api/v1/countries", { headers: wgHeaders }).then((r) => r.json()),
        fetch("https://whitegen.org/api/v1/languages", { headers: wgHeaders }).then((r) => r.json()),
      ]);
      const countryByIso = Object.fromEntries(
        (countries as { iso_code: string; id: number }[]).map((c) => [c.iso_code, c.id])
      );
      const langByIso = Object.fromEntries(
        (languages as { iso_code: string; id: number }[]).map((l) => [l.iso_code, l.id])
      );

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        send("log", `\n[${i + 1}/${keys.length}] ${key}`);

        let domain = getDomain(key) ?? "";
        let topic = "";
        let geo = "";
        let langOverride = "";

        try {
          const detail = await fetch(
            `https://jira.lucky-team.pro/rest/greenhopper/1.0/xboard/issue/details.json?rapidViewId=520&issueIdOrKey=${key}&loadSubtasks=true&_=${Date.now()}`,
            { headers: jiraHeaders, method: "GET" }
          ).then((r) => r.json());

          const parsed = parseTaskInfo(detail as Record<string, unknown>);
          topic = parsed.topic;
          geo = parsed.geo;
          langOverride = parsed.langOverride;
          if (!domain && parsed.domain) {
            domain = parsed.domain;
            setDomainIfMissing(key, JIRA_USER, domain);
          }
          send("log", `   domain=${domain} geo=${geo} topic=${topic}`);
        } catch (err) {
          send("error", `   Ошибка получения данных Jira: ${err instanceof Error ? err.message : String(err)}`);
        }

        if (!domain) {
          send("error", `   Нет домена для ${key} — пропускаем`);
          continue;
        }

        if (i > 0) {
          send("log", "   Ждём 2s...");
          await new Promise((r) => setTimeout(r, 2000));
        }

        const langIso = langOverride || GEO_TO_LANG[geo] || "nl";
        const country_id = countryByIso[geo] ?? null;
        const language_id = langByIso[langIso] ?? 1;
        const name = domain.replace(/\.[^.]+$/, "");

        const body = { number: key, name, domain, type: topic, language_id, country_id };

        try {
          const result = await fetch("https://whitegen.org/api/v1/generator/create", {
            headers: wgHeaders,
            body: JSON.stringify(body),
            method: "POST",
          }).then((r) => r.json());

          if (result?.id || result?.number) {
            send("log", `   ✓ Создана генерация (id=${result.id ?? "?"})`);
          } else {
            send("error", `   ✗ Ответ: ${JSON.stringify(result)}`);
          }
        } catch (err) {
          send("error", `   ✗ ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      send("log", "\n✅ Готово. Дождитесь завершения генерации и скачайте снова.");
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
