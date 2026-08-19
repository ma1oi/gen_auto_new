import { NextResponse } from "next/server";

// openid+email — не для доступа к данным, а только чтобы знать, чей это
// аккаунт (для лога подключения в /api/auth/google/callback)
const SCOPE = "openid email https://www.googleapis.com/auth/spreadsheets.readonly";

export async function GET(request: Request) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  if (!clientId) {
    return new NextResponse("Не задан NEXT_PUBLIC_GOOGLE_CLIENT_ID в .env.local", { status: 500 });
  }

  const { searchParams, origin: requestOrigin } = new URL(request.url);
  // За реверс-прокси (nginx/PM2 и т.п.) request.url отражает то, что прокси
  // реально прислал Next.js (внутренний Host-заголовок) — это может быть
  // внутренний адрес вида localhost:PORT, а не публичный домен. Поэтому для
  // OAuth-редиректов используем явно заданный APP_URL, если он есть, а не
  // вычисленный origin запроса.
  const origin = process.env.NEXT_PUBLIC_APP_URL || requestOrigin;
  const state = searchParams.get("state") ?? "";

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", `${origin}/api/auth/google/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  // offline + consent — иначе Google отдаёт refresh_token только при самом
  // первом согласии этого юзера на этот client_id, а нам он нужен каждый раз
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  if (state) authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
