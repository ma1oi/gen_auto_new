import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { execFile } from "child_process";
import os from "os";
import path from "path";
import { todayDateTag } from "@/lib/date-tag";
import { appendPipelineLog } from "@/lib/log-file";
import { getCredentials } from "@/lib/server-credentials";

export interface ManualMeta {
  taskNumber?: string;
  // архив, добавленный напрямую со страницы "Я.Диск" (без деплоя на сервер) —
  // номер задачи ему не нужен, на Я.Диск он уезжает под тем же именем,
  // с которым его загрузил пользователь
  noTaskNumber?: boolean;
}

function unzip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("unzip", ["-o", "-q", zipPath, "-d", destDir], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// zip-архивы иногда тащат с собой мусор упаковщика (__MACOSX, .DS_Store) —
// он не часть сайта, чистим сразу после распаковки
function stripArchiveJunk(dir: string): void {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === "__MACOSX" || name === ".DS_Store") {
      rmSync(p, { recursive: true, force: true });
      continue;
    }
    if (statSync(p).isDirectory()) stripArchiveJunk(p);
  }
}

// Принимает файлы, выбранные через <input webkitdirectory> (или перетащенные)
// на клиенте — папками или ZIP-архивами (архив разворачивается в папку с
// именем файла без .zip) — и складывает их в датированную папку
// gen_auto/ручники_DD-MM-YYYY/ (каждый File из папки приходит с .name = его
// относительным путём, например "youtube.com/assets/style.css"). Эта же
// папка потом заливается на сервер через /commit и остаётся на диске 7 дней
// — её же показывает вкладка "Я.Диск".
export async function POST(request: Request) {
  const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");
  const stagedDir = path.join(genAutoDir, `ручники_${todayDateTag()}`);
  const { jiraUser } = getCredentials(request);

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    appendPipelineLog("manual-upload/stage", "error", "Подготовка к заливке: нет файлов", jiraUser);
    return NextResponse.json({ error: "Нет файлов" }, { status: 400 });
  }

  let taskNumbers: Record<string, string> = {};
  const taskNumbersRaw = formData.get("taskNumbers");
  if (typeof taskNumbersRaw === "string") {
    try {
      taskNumbers = JSON.parse(taskNumbersRaw) as Record<string, string>;
    } catch {
      taskNumbers = {};
    }
  }
  const noTaskNumber = formData.get("noTaskNumber") === "true";

  const zipFiles: { file: File; name: string }[] = [];
  const treeFiles: File[] = [];
  for (const file of files) {
    const segments = file.name.split("/").filter((s) => s && s !== ".." && s !== ".");
    if (segments.length === 1 && /\.zip$/i.test(segments[0])) {
      zipFiles.push({ file, name: segments[0].replace(/\.zip$/i, "") });
    } else {
      treeFiles.push(file);
    }
  }

  const names = new Set<string>();
  for (const file of treeFiles) {
    const top = file.name.split("/").filter((s) => s && s !== ".." && s !== ".")[0];
    if (top) names.add(top);
  }
  for (const { name } of zipFiles) names.add(name);

  // если сегодня уже заливали папку с таким же именем — сносим её перед
  // повторной заливкой, иначе файлы, которых нет в новой версии, останутся
  // от старой (и уедут на сервер, и попадут в архив на вкладке "Я.Диск")
  for (const name of names) {
    const dir = path.join(stagedDir, name);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  for (const file of treeFiles) {
    const relPath = file.name;
    // защита от выхода за пределы stagedDir через ".." в относительном пути
    const segments = relPath.split("/").filter((s) => s && s !== ".." && s !== ".");
    if (segments.length === 0) continue;
    // macOS кладёт .DS_Store в каждую папку, которую открывали в Finder —
    // это не часть сайта, отбрасываем при заливке, а не фильтруем потом
    if (segments[segments.length - 1] === ".DS_Store") continue;

    const destPath = path.join(stagedDir, ...segments);
    mkdirSync(path.dirname(destPath), { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    writeFileSync(destPath, buf);
  }

  for (const { file, name } of zipFiles) {
    const destDir = path.join(stagedDir, name);
    mkdirSync(destDir, { recursive: true });
    const tmpZipPath = path.join(os.tmpdir(), `manual-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    const buf = Buffer.from(await file.arrayBuffer());
    writeFileSync(tmpZipPath, buf);
    try {
      await unzip(tmpZipPath, destDir);
      stripArchiveJunk(destDir);
    } finally {
      rmSync(tmpZipPath, { force: true });
    }
  }

  // .manual-meta.json — сайдкар, читается вкладкой "Я.Диск" при формировании
  // имени архива: обычный ручник → домен.номер.zip, архив без номера задачи
  // (со страницы "Я.Диск") → имя.zip как есть
  for (const name of names) {
    const taskNumber = taskNumbers[name]?.trim();
    const meta: ManualMeta | null = taskNumber ? { taskNumber } : noTaskNumber ? { noTaskNumber: true } : null;
    if (!meta) continue;
    writeFileSync(path.join(stagedDir, name, ".manual-meta.json"), JSON.stringify(meta));
  }

  appendPipelineLog(
    "manual-upload/stage",
    "log",
    `Подготовлено к заливке: ${Array.from(names).join(", ")} (${files.length} файлов)`,
    jiraUser
  );
  return NextResponse.json({ stagedDir, names: Array.from(names) });
}
