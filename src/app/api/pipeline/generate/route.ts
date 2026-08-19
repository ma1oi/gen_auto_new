import { getCredentials } from "@/lib/server-credentials";
import { markCreated, setDomainIfMissing, setDeployMeta } from "@/lib/pipeline-db";
import { GEO_TO_LANG } from "@/lib/parse-task-info";
import { AUTH_ERROR_CODE, type PreviewTask } from "@/types";
import { appendPipelineLog } from "@/lib/log-file";
import { safeEnqueue, safeClose } from "@/lib/sse";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const { whitegenCookie, whitegenAuth, jiraUser } = getCredentials(request);
  const { tasks } = (await request.json()) as { tasks: PreviewTask[] };

  const wgHeaders: Record<string, string> = {
    accept: "application/json",
    authorization: whitegenAuth,
    "content-type": "application/json",
    cookie: whitegenCookie,
    Referer: "https://whitegen.org/dashboard",
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, message: string) => {
        appendPipelineLog("generate", type, message, jiraUser);
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type, message })}\n\n`);
      };
      const done = (code: number) => {
        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: "done", code })}\n\n`);
        safeClose(controller);
      };

      send("log", "Loading countries and languages...");
      let countryByIso: Record<string, number> = {};
      let langByIso: Record<string, number> = {};
      try {
        const [countriesRes, languagesRes] = await Promise.all([
          fetch("https://whitegen.org/api/v1/countries", { headers: wgHeaders }),
          fetch("https://whitegen.org/api/v1/languages", { headers: wgHeaders }),
        ]);

        // 401/403 — кука точно протухла/невалидна, это не сетевая ошибка
        if (countriesRes.status === 401 || countriesRes.status === 403 || languagesRes.status === 401 || languagesRes.status === 403) {
          send("error", "Whitegen отклонил авторизацию — обновите Cookie в Настройках → Whitegen");
          done(AUTH_ERROR_CODE);
          return;
        }
        if (!countriesRes.ok || !languagesRes.ok) {
          send("error", `Whitegen API error: countries ${countriesRes.status}, languages ${languagesRes.status}`);
          done(1);
          return;
        }

        const [countries, languages]: [unknown, unknown] = await Promise.all([countriesRes.json(), languagesRes.json()]);

        // при протухшей куке whitegen иногда отвечает 200 с HTML/JSON-объектом
        // ошибки вместо массива — тогда ниже упал бы .map с невнятным TypeError
        if (!Array.isArray(countries) || !Array.isArray(languages)) {
          send("error", "Whitegen вернул неожиданный ответ вместо списка стран/языков — похоже, сессия истекла. Обновите Cookie в Настройках → Whitegen");
          done(AUTH_ERROR_CODE);
          return;
        }

        countryByIso = Object.fromEntries(
          (countries as { iso_code: string; id: number }[]).map((c) => [c.iso_code, c.id])
        );
        langByIso = Object.fromEntries(
          (languages as { iso_code: string; id: number }[]).map((l) => [l.iso_code, l.id])
        );
      } catch (err) {
        send("error", `Ошибка загрузки стран/языков: ${err instanceof Error ? err.message : String(err)}`);
        done(1);
        return;
      }

      send("log", `Found ${tasks.length} tasks to create`);

      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        send("log", `\n[${i + 1}/${tasks.length}] Waiting 2s before creating generation for ${task.key}...`);
        await sleep(2000);

        const langIso = task.langOverride || GEO_TO_LANG[task.geo] || "nl";
        const country_id = countryByIso[task.geo] ?? null;
        const language_id = langByIso[langIso] ?? 1;
        const name = task.domain.replace(/\.[^.]+$/, "");

        const body = {
          number: task.key,
          name,
          domain: task.domain,
          type: task.topic,
          language_id,
          country_id,
        };

        try {
          const result = await fetch("https://whitegen.org/api/v1/generator/create", {
            headers: wgHeaders,
            body: JSON.stringify(body),
            method: "POST",
          }).then((r) => r.json());

          send("log", `Creating generation for ${task.key}... result: ${JSON.stringify(result)}`);

          markCreated(task.key, jiraUser);
          if (task.domain) setDomainIfMissing(task.key, jiraUser, task.domain);
          setDeployMeta(task.key, task.deployType, task.serverIp);
        } catch (err) {
          send("error", `${task.key}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      send("log", "\nAll done.");
      done(0);
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
