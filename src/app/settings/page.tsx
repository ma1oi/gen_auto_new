"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Link2, Loader2, Settings as SettingsIcon } from "lucide-react";
import { useSettingsStore } from "@/store/settings.store";

const TAMPERMONKEY_SCRIPT_URL = "/tampermonkey/jira-final-check-autofill.user.js";

// Проверяем на клиенте только чтобы показать внятную ошибку сразу в кнопке —
// сам редирект на Google строит /api/auth/google/start (там же и читается
// этот env). NEXT_PUBLIC_-переменные доступны и на сервере, и в браузере.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

interface GoogleOAuthMessage {
  source?: string;
  ok?: boolean;
  refreshToken?: string;
  email?: string | null;
  error?: string;
  state?: string;
}

function GoogleConnectButton() {
  const s = useSettingsStore();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = Boolean(s.googleSheetsRefreshToken);
  const jiraUser = s.jiraUser.trim();

  // ресинк серверного in-memory кэша (google-token-cache.ts) — он пустеет при
  // рестарте Node-процесса, а localStorage браузера всё ещё помнит токен.
  // Кэш per-user (см. google-token-cache.ts), поэтому jiraUser обязателен.
  useEffect(() => {
    if (!s.googleSheetsRefreshToken || !jiraUser) return;
    fetch("/api/pipeline/google-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: s.googleSheetsRefreshToken, jiraUser }),
    }).catch(() => {});
  }, [s.googleSheetsRefreshToken, jiraUser]);

  function connect() {
    if (!jiraUser) {
      setError("Сначала укажите Jira username выше — Google-доступ привязывается к нему");
      return;
    }
    if (!GOOGLE_CLIENT_ID) {
      setError("Не задан NEXT_PUBLIC_GOOGLE_CLIENT_ID (см. .env.local)");
      return;
    }
    setError(null);
    setConnecting(true);

    // jiraUser зашивается прямо в state — единственное, что Google гарантированно
    // возвращает как есть (см. jiraUserFromState в callback/route.ts)
    const state = `${encodeURIComponent(jiraUser)}|${Math.random().toString(36).slice(2)}`;
    const popup = window.open(
      `/api/auth/google/start?state=${encodeURIComponent(state)}`,
      "google-oauth",
      "width=520,height=650"
    );
    if (!popup) {
      setConnecting(false);
      setError("Браузер заблокировал попап — разрешите попапы для этой страницы");
      return;
    }

    const handleResult = (data: GoogleOAuthMessage) => {
      if (data?.source !== "google-oauth" || data.state !== state) return;
      cleanup();
      setConnecting(false);
      if (data.ok && data.refreshToken) {
        s.set({ googleSheetsRefreshToken: data.refreshToken, googleSheetsEmail: data.email ?? "" });
      } else {
        setError(data.error ?? "Не удалось подключить Google");
      }
    };

    // основной канал: переживает то, что попап уходил на accounts.google.com
    // (тот выставляет Cross-Origin-Opener-Policy, после чего window.opener у
    // попапа становится null — postMessage через него уже не долетает)
    const bc = "BroadcastChannel" in window ? new BroadcastChannel("gen-auto-google-oauth") : null;
    if (bc) bc.onmessage = (event) => handleResult(event.data as GoogleOAuthMessage);

    // фолбэк для браузеров без BroadcastChannel — сработает, если opener не был порван
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      handleResult(event.data as GoogleOAuthMessage);
    };
    window.addEventListener("message", onMessage);

    // если юзер закрыл попап руками — не оставлять кнопку в "Подключаю..." навсегда.
    // popup.closed тоже может упереться в COOP после чужого домена — не даём упасть.
    const pollClosed = setInterval(() => {
      let closed = false;
      try {
        closed = popup.closed;
      } catch {
        closed = false;
      }
      if (closed) {
        cleanup();
        setConnecting(false);
      }
    }, 500);

    function cleanup() {
      window.removeEventListener("message", onMessage);
      if (bc) bc.close();
      clearInterval(pollClosed);
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={connect}
        disabled={connecting || !jiraUser}
        title={!jiraUser ? "Сначала укажите Jira username в разделе Jira выше" : undefined}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {connecting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : connected ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Link2 className="w-3.5 h-3.5" />
        )}
        {connecting ? "Подключаю..." : connected ? "Переподключить Google" : "Подключить Google"}
      </button>
      {!jiraUser && (
        <p className="text-xs text-amber-400">Сначала укажите Jira username в разделе Jira выше</p>
      )}
      {connected && (
        <p className="text-xs text-emerald-400">
          Подключено{s.googleSheetsEmail ? `: ${s.googleSheetsEmail}` : ""}
        </p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function CopyScriptButton() {
  const jiraUser = useSettingsStore((st) => st.jiraUser.trim());
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    if (!jiraUser) {
      setError("Сначала укажите Jira username выше — он зашивается в код скрипта");
      return;
    }
    setError(null);
    try {
      const res = await fetch(TAMPERMONKEY_SCRIPT_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      // персонализация: скрипт сообщает gen_auto, чей это запрос, чтобы
      // /api/pipeline/server-for-domain искал IP в Google Таблице от
      // Google-аккаунта именно этого пользователя (см. google-token-cache.ts).
      // API_BASE берём из того адреса, откуда сейчас открыт /settings — так
      // скопированный локально скрипт бьёт в localhost, а скопированный с
      // прода — в прод, одним и тем же файлом.
      const apiBase = window.location.origin;
      const apiHost = window.location.hostname;
      let code = raw
        .replace('const JIRA_USER = "__JIRA_USER__";', `const JIRA_USER = ${JSON.stringify(jiraUser)};`)
        .replace('const API_BASE = "__API_BASE__";', `const API_BASE = ${JSON.stringify(apiBase)};`);
      // localhost/127.0.0.1 уже задекларированы в @connect в самом файле —
      // прод-хост (или любой другой) добавляем сюда
      if (apiHost !== "localhost" && apiHost !== "127.0.0.1") {
        code = code.replace("// @connect      __API_HOST__\n", `// @connect      ${apiHost}\n`);
      } else {
        code = code.replace("// @connect      __API_HOST__\n", "");
      }
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось скопировать код");
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={copy}
        disabled={!jiraUser}
        title={!jiraUser ? "Сначала укажите Jira username в разделе Jira выше" : undefined}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Скопировано" : "Скопировать код"}
      </button>
      {!jiraUser && (
        <p className="text-xs text-amber-400">Сначала укажите Jira username в разделе Jira выше</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: string;
}) {
  const shared =
    "w-full rounded-md border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60";
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      {multiline ? (
        <textarea
          className={`${shared} min-h-[72px] resize-y font-mono text-xs`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={shared}
          type={type ?? "text"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const s = useSettingsStore();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex-shrink-0 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-sm px-6 py-3.5">
        <div className="flex items-center gap-3 max-w-[900px] mx-auto">
          <Link
            href="/"
            className="w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <SettingsIcon className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">Настройки</h1>
            <p className="text-xs text-slate-500">Хранятся локально в этом браузере</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-[900px] mx-auto space-y-5">
          <Section title="Jira">
            <Field
              label="Cookie"
              value={s.jiraCookie}
              onChange={(v) => s.set({ jiraCookie: v })}
              placeholder="SL_GWPT_Show_Hide_tmp=1; seraph.rememberme.cookie=...; JSESSIONID=...;"
              multiline
            />
            <Field
              label="Пользователь (jira username)"
              value={s.jiraUser}
              onChange={(v) => s.set({ jiraUser: v })}
              placeholder="d.smirnov"
            />
          </Section>

          <Section title="Whitegen">
            <Field
              label="Cookie"
              value={s.whitegenCookie}
              onChange={(v) => s.set({ whitegenCookie: v })}
              placeholder="SL_GWPT_Show_Hide_tmp=1; auth_token=...; auth_user_email=...;"
              multiline
            />
          </Section>

          <Section title="Google Таблица (домены/сервера)">
            <p className="text-xs text-slate-500">
              Используется при деплое задач без IP в описании — ищет IP/логин/пароль сервера по домену в общей
              Google-таблице. Подключите свой Google-аккаунт (нужен доступ к этой таблице).
            </p>
            <GoogleConnectButton />
          </Section>

          <Section title="Яндекс.Диск">
            <Field
              label="Access token"
              value={s.yandexDiskToken}
              onChange={(v) => s.set({ yandexDiskToken: v })}
              placeholder="y0__..."
            />
            <div className="text-xs text-slate-500 space-y-1.5">
              <p className="text-slate-400 font-medium">Как получить токен:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>
                  Открыть{" "}
                  <a
                    href="https://yandex.ru/dev/disk/poligon/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline"
                  >
                    yandex.ru/dev/disk/poligon
                  </a>{" "}
                  и войти в свой Яндекс-аккаунт (тот, на диск которого нужно грузить файлы).
                </li>
                <li>На странице нажать кнопку «Получить OAuth-токен».</li>
                <li>В открывшемся окне нажать «Разрешить».</li>
                <li>Скопировать токен (начинается с <code className="text-slate-400">y0_</code>) и вставить в поле выше.</li>
              </ol>
              <p>Токен действует около года. Если перестанет работать — повторить те же шаги и вставить новый.</p>
            </div>
          </Section>

          <Section title="Сервер (универсальные доступы)">
            <Field
              label="Логин"
              value={s.serverLogin}
              onChange={(v) => s.set({ serverLogin: v })}
            />
            <Field
              label="Пароль"
              value={s.serverPassword}
              onChange={(v) => s.set({ serverPassword: v })}
              type="password"
            />
            <p className="text-xs text-slate-600">
              Используются при деплое задач с IP-сервером в описании (без CSV-доступов) — подключение по IP из задачи и этим логином/паролем.
            </p>
          </Section>

          <Section title="Уведомления">
            <label className="flex items-start gap-2.5 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={s.notificationsEnabled}
                onChange={async (e) => {
                  const checked = e.target.checked;
                  if (checked && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
                    await Notification.requestPermission();
                  }
                  s.set({ notificationsEnabled: checked });
                }}
                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950/60 accent-violet-500"
              />
              <span>
                Каждые 60 секунд проверять статус задач в генераторе. Когда все задачи завершены (готовы, отменены
                или с ошибкой) — показывать браузерное уведомление. Задачи с ошибкой автоматически отправляются на
                перегенерацию.
              </span>
            </label>
            {s.notificationsEnabled &&
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "denied" && (
                <p className="text-xs text-red-400">
                  Уведомления заблокированы в браузере — разреши их для этого сайта в настройках браузера.
                </p>
              )}
          </Section>

          <Section title="Tampermonkey — автозаполнение Jira">
            <p className="text-xs text-slate-500">
              Скрипт на экране перехода «Финальная проверка» в Jira сам подставляет домен (если пуст — берёт из
              описания задачи) и IP сервера.
            </p>
            <CopyScriptButton />
            <div className="text-xs text-slate-500 space-y-1.5">
              <p className="text-slate-400 font-medium">Установка:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>
                  Поставить расширение{" "}
                  <a
                    href="https://www.tampermonkey.net/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline"
                  >
                    Tampermonkey
                  </a>{" "}
                  в браузер.
                </li>
                <li>Нажать «Скопировать код» выше.</li>
                <li>Открыть панель Tampermonkey → «Создать новый скрипт».</li>
                <li>Выделить весь код-заглушку в редакторе, вставить скопированный код вместо него.</li>
                <li>
                  Сохранить (<code className="text-slate-400">Cmd/Ctrl+S</code>) — скрипт сразу активен.
                </li>
              </ol>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
