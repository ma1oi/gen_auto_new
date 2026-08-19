"use client";

import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/store/settings.store";
import { usePipelineStore } from "@/store/pipeline.store";
import { apiFetch } from "@/lib/api-client";
import type { WhitegenTask } from "@/types";

const POLL_INTERVAL_MS = 60_000;
const TERMINAL_STATUSES = new Set<WhitegenTask["status"]>(["finished", "canceled", "failed"]);

// Какому набору задач (по id) уже отправляли уведомление "все готовы" —
// в localStorage, чтобы пережить перезагрузку страницы. Если следующий
// готовый пакет состоит из других id (новая генерация) — уведомим снова.
const NOTIFIED_BATCH_KEY = "gen_auto:notified-batch";

function batchKeyOf(tasks: WhitegenTask[]): string {
  return tasks.map((t) => t.id).sort((a, b) => a - b).join(",");
}

function getLastNotifiedBatch(): string {
  try {
    return localStorage.getItem(NOTIFIED_BATCH_KEY) ?? "";
  } catch {
    return "";
  }
}

function setLastNotifiedBatch(key: string) {
  try {
    localStorage.setItem(NOTIFIED_BATCH_KEY, key);
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — переживём дубль уведомления
  }
}

function sendBrowserNotification(tasks: WhitegenTask[]) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const finished = tasks.filter((t) => t.status === "finished").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const canceled = tasks.filter((t) => t.status === "canceled").length;
  new Notification("Генерация завершена", {
    body: `Готово: ${finished}, ошибок: ${failed}, отменено: ${canceled}`,
    icon: "/favicon.ico",
  });
}

// Всегда смонтирован в layout (не привязан к конкретной странице), пока
// включены уведомления — раз в минуту опрашивает статус генератора,
// шлёт браузерное уведомление, когда все задачи дошли до финального
// статуса, и один раз отправляет упавшие задачи на перегенерацию через
// отдельный эндпоинт /api/pipeline/retry.
export function GeneratorStatusWatcher() {
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const retriedIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!notificationsEnabled) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await apiFetch("/api/pipeline/status");
        if (cancelled) return;
        if (!res.ok) {
          console.warn("[gen_auto watcher] /api/pipeline/status вернул", res.status);
          return;
        }
        const data = (await res.json()) as { tasks: WhitegenTask[]; error?: string };
        if (cancelled) return;
        if (data.error) {
          console.warn("[gen_auto watcher] ошибка от Whitegen:", data.error);
        }
        const tasks = data.tasks ?? [];
        console.log(
          `[gen_auto watcher] тик: ${tasks.length} задач,`,
          tasks.reduce<Record<string, number>>((acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; }, {})
        );
        usePipelineStore.getState().setWhitegenTasks(tasks);

        let triggeredRetry = false;
        for (const task of tasks) {
          if (task.status !== "failed" || retriedIdsRef.current.has(task.id)) continue;
          retriedIdsRef.current.add(task.id);
          triggeredRetry = true;
          try {
            const r = await apiFetch("/api/pipeline/retry", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: task.id }),
            });
            const rd = (await r.json()) as { ok: boolean };
            usePipelineStore.getState().addNotification(
              rd.ok
                ? `↻ ${task.number} автоматически отправлена на перегенерацию`
                : `Не удалось автоматически перегенерировать ${task.number}`,
              rd.ok ? "info" : "error"
            );
          } catch {
            // останется помеченной как retried — не будем долбить бесконечно
          }
        }

        if (triggeredRetry) {
          // только что запустили перегенерацию — это ещё не "всё готово",
          // дождёмся, пока статус обновится на следующем тике
          return;
        }

        const allReady = tasks.length > 0 && tasks.every((t) => TERMINAL_STATUSES.has(t.status));
        if (!allReady) {
          console.log("[gen_auto watcher] allReady=false");
          return;
        }

        const batchKey = batchKeyOf(tasks);
        const alreadyNotified = getLastNotifiedBatch() === batchKey;
        console.log(`[gen_auto watcher] allReady=true alreadyNotified=${alreadyNotified}`);
        if (!alreadyNotified) {
          setLastNotifiedBatch(batchKey);
          console.log("[gen_auto watcher] отправляю браузерное уведомление");
          sendBrowserNotification(tasks);
        }
      } catch (e) {
        console.warn("[gen_auto watcher] тик упал:", e);
      }
    };

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [notificationsEnabled]);

  return null;
}
