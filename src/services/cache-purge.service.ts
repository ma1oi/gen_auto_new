import { readFileSync } from "fs";
import path from "path";

function getConfig(): { CACHE_PURGE_URL: string; CACHE_PURGE_SESSION: string } {
  const configPath = path.join(process.cwd(), "gen_auto", "config.js");
  let content: string;
  try {
    content = readFileSync(configPath, "utf8");
  } catch {
    // config.js больше не в git (там раньше лежали реальные куки) — но
    // CACHE_PURGE_URL/SESSION взять больше неоткуда, файл нужно завести на
    // сервере руками (см. .gitignore — почему он не приезжает через git)
    throw new Error(`${configPath} не найден — создайте его на сервере с CACHE_PURGE_URL/CACHE_PURGE_SESSION`);
  }
  const extract = (key: string): string =>
    content.match(new RegExp(`${key}:\\s*["']([^"']+)["']`))?.[1] ?? "";
  return {
    CACHE_PURGE_URL: extract("CACHE_PURGE_URL"),
    CACHE_PURGE_SESSION: extract("CACHE_PURGE_SESSION"),
  };
}

export async function purgeCacheDomains(
  domains: string[]
): Promise<{ ok: boolean; status: number; body: string }> {
  const { CACHE_PURGE_URL, CACHE_PURGE_SESSION } = getConfig();

  const res = await fetch(CACHE_PURGE_URL, {
    method: "POST",
    headers: {
      accept: "*/*",
      "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
      "content-type": "application/json",
      Referer: `http://185.9.25.146/cache-purge/`,
    },
    body: JSON.stringify({
      session_id: CACHE_PURGE_SESSION,
      domains_requested: domains,
    }),
  });

  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
