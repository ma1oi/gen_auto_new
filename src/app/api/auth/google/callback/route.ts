import { NextResponse } from "next/server";
import { setGoogleSheetsRefreshToken } from "@/lib/google-token-cache";
import { appendPipelineLog } from "@/lib/log-file";

// id_token — подписанный JWT от Google (получен напрямую по HTTPS с
// oauth2.googleapis.com в этом же запросе), проверять подпись незачем —
// нужен только email claim для лога подключения.
function decodeEmailFromIdToken(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1];
    const json = Buffer.from(payload, "base64url").toString("utf-8");
    return (JSON.parse(json) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
}

// GoogleConnectButton кодирует jira username прямо в state (единственный
// параметр, который Google гарантированно возвращает как есть) — так кэш
// в google-token-cache.ts может быть per-user без отдельной сессии/куки.
// Формат: "<encodeURIComponent(jiraUser)>|<nonce>".
function jiraUserFromState(state: string): string {
  const sep = state.indexOf("|");
  if (sep === -1) return "";
  try {
    return decodeURIComponent(state.slice(0, sep));
  } catch {
    return "";
  }
}

// Открывается в попапе из /settings (GoogleConnectButton). Результат отдаём
// родительскому окну и закрываем попап — без редиректов и без хранения
// состояния на сервере (кроме самого refresh-токена в кэше).
//
// Именно BroadcastChannel, а не window.opener.postMessage: пока попап был на
// accounts.google.com (логин/согласие), Chrome по Cross-Origin-Opener-Policy
// от самого Google рвёт связь window.opener → он остаётся null, даже когда
// попап возвращается на наш origin. BroadcastChannel завязан только на origin,
// а не на opener-ссылку, поэтому переживает эту навигацию через чужой домен.
function respondHtml(origin: string, payload: Record<string, unknown>) {
  const html = `<!doctype html><html><body><script>
    var payload = ${JSON.stringify(payload)};
    try {
      var bc = new BroadcastChannel("gen-auto-google-oauth");
      bc.postMessage(payload);
      bc.close();
    } catch (e) { /* старый браузер без BroadcastChannel — фолбэк ниже */ }
    if (window.opener) {
      try { window.opener.postMessage(payload, ${JSON.stringify(origin)}); } catch (e) {}
    }
    setTimeout(function () { window.close(); }, 150);
  </script></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  // см. комментарий в /api/auth/google/start — должно совпадать с тем origin,
  // который использовался при построении redirect_uri в /start (иначе обмен
  // code на токен упадёт с redirect_uri_mismatch), и с реальным origin
  // страницы /settings (иначе postMessage/BroadcastChannel уйдёт не туда)
  const origin = process.env.NEXT_PUBLIC_APP_URL || requestOrigin;
  const code = searchParams.get("code");
  const state = searchParams.get("state") ?? "";
  const oauthError = searchParams.get("error");

  if (oauthError || !code) {
    appendPipelineLog("google-oauth", "error", `Подключение отменено/не удалось: ${oauthError ?? "нет code"}`);
    return respondHtml(origin, {
      source: "google-oauth",
      ok: false,
      error: oauthError ?? "Google не вернул code",
      state,
    });
  }

  const jiraUser = jiraUserFromState(state);
  if (!jiraUser) {
    appendPipelineLog("google-oauth", "error", "Подключение отклонено: не задан Jira username в настройках");
    return respondHtml(origin, {
      source: "google-oauth",
      ok: false,
      error: "Не задан Jira username в настройках — заполните его перед подключением Google",
      state,
    });
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) {
    appendPipelineLog("google-oauth", "error", "Не заданы GOOGLE_CLIENT_ID/SECRET на сервере (.env.local)", jiraUser);
    return respondHtml(origin, {
      source: "google-oauth",
      ok: false,
      error: "На сервере не заданы NEXT_PUBLIC_GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (.env.local)",
      state,
    });
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = (await tokenRes.json()) as {
      refresh_token?: string;
      id_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.refresh_token) {
      const error =
        tokenData.error_description ?? tokenData.error ?? "Google не вернул refresh_token — попробуйте ещё раз";
      appendPipelineLog("google-oauth", "error", `Подключение не удалось: ${error}`, jiraUser);
      return respondHtml(origin, { source: "google-oauth", ok: false, error, state });
    }

    const email = tokenData.id_token ? decodeEmailFromIdToken(tokenData.id_token) : null;
    setGoogleSheetsRefreshToken(jiraUser, tokenData.refresh_token);
    appendPipelineLog("google-oauth", "log", `Google Sheets подключён: ${email ?? "аккаунт неизвестен"}`, jiraUser);
    return respondHtml(origin, {
      source: "google-oauth",
      ok: true,
      refreshToken: tokenData.refresh_token,
      email,
      state,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    appendPipelineLog("google-oauth", "error", `Подключение не удалось: ${error}`, jiraUser);
    return respondHtml(origin, { source: "google-oauth", ok: false, error, state });
  }
}
