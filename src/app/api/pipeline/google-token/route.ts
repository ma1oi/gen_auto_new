import { NextResponse } from "next/server";
import { setGoogleSheetsRefreshToken } from "@/lib/google-token-cache";

// Ресинк серверного кэша refresh-токена из localStorage браузера — на случай,
// если Node-процесс перезапустился (кэш в памяти, /api/auth/google/callback
// заполняет его только в момент самого подключения). Settings.page.tsx шлёт
// сюда сохранённый токен при каждом маунте. jiraUser обязателен — кэш теперь
// per-user (см. google-token-cache.ts).
export async function POST(request: Request) {
  const { refreshToken, jiraUser } = (await request.json()) as { refreshToken?: string; jiraUser?: string };
  if (!refreshToken || !jiraUser?.trim()) {
    return NextResponse.json({ ok: false, error: "refreshToken и jiraUser обязательны" }, { status: 400 });
  }
  setGoogleSheetsRefreshToken(jiraUser, refreshToken);
  return NextResponse.json({ ok: true });
}
