import { existsSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { getCredentials } from "@/lib/server-credentials";
import { resourceExists, uploadNamedFolderToYandexDisk, uploadSingleFileToYandexDisk } from "@/services/yadisk.service";
import { zipDirectory } from "@/lib/zip";
import { markUploaded } from "@/lib/yadisk-marker";
import { appendPipelineLog } from "@/lib/log-file";

interface SelectedItem {
  date: string;
  name: string;
  type: "generator" | "manual" | "manual-backup" | "manual-archive";
  taskNumber?: string;
  // пользователь нажал "Перезаписать" в предупреждении о конфликте —
  // пропускаем проверку existence и грузим поверх того, что на Диске
  force?: boolean;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const { jiraUser, yandexDiskToken } = getCredentials(request);
  const { items } = (await request.json()) as { items: SelectedItem[] };
  const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");

  const stream = new ReadableStream({
    async start(controller) {
      // клиент отменил запрос (кнопка "Стоп") — дальше в контроллер не
      // пишем, соединение уже закрыто с той стороны
      const enqueue = (payload: Record<string, unknown>) => {
        if (request.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch { /* controller уже закрыт клиентом */ }
      };
      const send = (type: string, message: string) => {
        appendPipelineLog("yadisk-upload/commit-selected", type, message, jiraUser);
        enqueue({ type, message });
      };
      // ключ совпадает с itemKey() на клиенте (`${date}:${type}:${name}`) —
      // так строку в таблице можно найти по событию напрямую
      const sendStatus = (item: SelectedItem, status: "running" | "ok" | "error" | "skip" | "exists", reason?: string) => {
        enqueue({ type: "upload-status", key: `${item.date}:${item.type}:${item.name}`, status, reason });
      };
      const done = (code: number) => {
        enqueue({ type: "done", code });
        try {
          controller.close();
        } catch { /* уже закрыт */ }
      };

      if (!yandexDiskToken) {
        send("error", "Не задан токен Яндекс.Диска — добавьте его в настройках");
        done(1);
        return;
      }
      if (!items?.length) {
        send("error", "Нечего загружать — ничего не выбрано");
        done(1);
        return;
      }

      let totalFiles = 0;
      let errorCount = 0;
      let existsCount = 0;

      for (const item of items) {
        // остановка между задачами — текущую (если уже начата) не рвём,
        // просто не берём в работу следующие
        if (request.signal.aborted) break;
        sendStatus(item, "running");

        if (item.type === "manual-backup") {
          const oldZipPath = path.join(genAutoDir, "downloads", "manual-backups", `${item.name}.old.zip`);
          if (!existsSync(oldZipPath)) {
            const reason = `бэкап не найден (${oldZipPath})`;
            send("error", `${item.name}: ${reason}`);
            sendStatus(item, "error", reason);
            errorCount++;
            continue;
          }
          const oldZipName = `${item.name}.old.zip`;
          send("log", `📁 ${item.name} — бэкап старого содержимого → ${oldZipName}`);
          try {
            await uploadSingleFileToYandexDisk(yandexDiskToken, oldZipPath, `disk:/Ручники/${oldZipName}`, (line) => send("log", line));
            totalFiles += 1;
            markUploaded(path.join(genAutoDir, `ручники_${item.date}`, item.name), "manual-backup");
            sendStatus(item, "ok");
          } catch (err) {
            errorCount++;
            const reason = err instanceof Error ? err.message : String(err);
            send("error", `${item.name} (бэкап): ${reason}`);
            sendStatus(item, "error", reason);
          }
          continue;
        }

        const folderName = item.type === "generator" ? `генератор_${item.date}` : `ручники_${item.date}`;
        const localDir = path.join(genAutoDir, folderName, item.name);

        if (!existsSync(localDir)) {
          const reason = `папка не найдена (${localDir})`;
          send("error", `${item.name}: ${reason}`);
          sendStatus(item, "error", reason);
          errorCount++;
          continue;
        }

        if (item.type === "generator") {
          const diskDir = `disk:/Генератор/${item.name.toUpperCase()}`;
          send("log", `📁 ${item.name} (${item.date})`);
          try {
            const result = await uploadNamedFolderToYandexDisk(yandexDiskToken, localDir, diskDir, (line) => send("log", `   ${line}`));
            totalFiles += result.files;
            markUploaded(localDir, "generator");
            sendStatus(item, "ok");
          } catch (err) {
            errorCount++;
            const reason = err instanceof Error ? err.message : String(err);
            send("error", `${item.name}: ${reason}`);
            sendStatus(item, "error", reason);
          }
          continue;
        }

        // ручник — заливается как единый zip-архив domain.номер.zip в папку
        // Ручники; номер задачи опционален — если его нет (или он уже есть в
        // самом имени, например архив назван по ключу задачи, а не по
        // домену) — просто domain.zip, без дублирования
        const digits = (item.taskNumber ?? "").replace(/\D+/g, "");
        const zipName = digits && !item.name.includes(digits) ? `${item.name}.${digits}.zip` : `${item.name}.zip`;
        const diskPath = `disk:/Ручники/${zipName}`;

        if (!item.force) {
          let exists = false;
          try {
            exists = await resourceExists(yandexDiskToken, diskPath);
          } catch (err) {
            errorCount++;
            const reason = err instanceof Error ? err.message : String(err);
            send("error", `${item.name}: ${reason}`);
            sendStatus(item, "error", reason);
            continue;
          }
          if (exists) {
            const reason = `на Я.Диске уже есть ${zipName}`;
            send("log", `⚠ ${item.name}: ${reason} — пропускаю`);
            sendStatus(item, "exists", reason);
            existsCount++;
            continue;
          }
        }

        const tmpZipPath = path.join(os.tmpdir(), `yadisk-${Date.now()}-${zipName}`);
        send("log", `📁 ${item.name} (${item.date}) → ${zipName}`);
        try {
          await zipDirectory(localDir, tmpZipPath, [".manual-meta.json", ".yadisk-uploaded.json", ".DS_Store"]);
          await uploadSingleFileToYandexDisk(yandexDiskToken, tmpZipPath, diskPath, (line) => send("log", line));
          totalFiles += 1;
          markUploaded(localDir, "manual");
          sendStatus(item, "ok");
        } catch (err) {
          errorCount++;
          const reason = err instanceof Error ? err.message : String(err);
          send("error", `${item.name}: ${reason}`);
          sendStatus(item, "error", reason);
        } finally {
          if (existsSync(tmpZipPath)) rmSync(tmpZipPath, { force: true });
        }
      }

      send("log", `\n✅ Загружено файлов: ${totalFiles}`);
      if (existsCount > 0) send("log", `⚠ Пропущено (уже на Я.Диске): ${existsCount}`);
      done(errorCount > 0 ? 1 : 0);
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
