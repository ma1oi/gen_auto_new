import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

// Tampermonkey-скрипт дёргает /api/pipeline/server-for-domain напрямую с
// jira.lucky-team.pro (GM_xmlhttpRequest) — у него нет доступа к localStorage
// gen_auto (другой origin), поэтому x-google-sheets-refresh-token из /settings
// он прислать не может. Держим refresh-токены здесь, по одному на каждого
// jira-пользователя — с тех пор, как у каждого свой Google-аккаунт, один общий
// токен на всех означал бы, что реально используется только токен того, кто
// подключился последним. Ключ — jira username, он же зашивается в персональную
// копию Tampermonkey-скрипта (см. /settings, CopyScriptButton) и присылается
// query-параметром ?jiraUser=... в каждом запросе оттуда. deploy/route.ts
// использует это как фолбэк, если заголовка нет в запросе.
//
// Персистится на диск (не только in-memory): иначе рестарт PM2/деплой на
// проде обнулял кэш, а Tampermonkey работает в фоне и никто не заходит на
// /settings, чтобы его пересинкать — токен "терялся" до следующего визита.
const STORE_PATH = path.join(
  process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto"),
  ".google-refresh-tokens.json"
);

function loadStore(): Record<string, string> {
  try {
    if (!existsSync(STORE_PATH)) return {};
    return JSON.parse(readFileSync(STORE_PATH, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

const cache = new Map<string, string>(Object.entries(loadStore()));

function persist(): void {
  try {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(Object.fromEntries(cache)), { mode: 0o600 });
  } catch {
    // диск недоступен на запись — переживаем, останется хотя бы in-memory на время жизни процесса
  }
}

export function setGoogleSheetsRefreshToken(jiraUser: string, token: string): void {
  const key = jiraUser.trim();
  if (!key) return;
  cache.set(key, token);
  persist();
}

export function getGoogleSheetsRefreshToken(jiraUser: string): string {
  return cache.get(jiraUser.trim()) ?? "";
}
