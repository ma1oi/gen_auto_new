import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { getCredentials } from "@/lib/server-credentials";
import { getArchivedDeployedKeys, getArchivedDomain } from "@/lib/pipeline-db";
import { lastNDateTags } from "@/lib/date-tag";
import type { ManualMeta } from "@/app/api/pipeline/manual-upload/stage/route";
import { readUploadedAt } from "@/lib/yadisk-marker";

export interface YaDiskItem {
  name: string;
  domain: string;
  type: "generator" | "manual" | "manual-backup" | "manual-archive";
  taskNumber?: string;
  uploadedAt?: string;
}

function readManualMeta(dir: string): ManualMeta | undefined {
  const metaPath = path.join(dir, ".manual-meta.json");
  if (!existsSync(metaPath)) return undefined;
  try {
    return JSON.parse(readFileSync(metaPath, "utf-8")) as ManualMeta;
  } catch {
    return undefined;
  }
}

export interface YaDiskDay {
  date: string;
  items: YaDiskItem[];
}

function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => !f.startsWith(".") && statSync(path.join(dir, f)).isDirectory());
}

function mtimeMs(p: string): number {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

export async function GET(request: Request) {
  const { jiraUser } = getCredentials(request);
  const genAutoDir = process.env.GEN_AUTO_DIR ?? path.join(process.cwd(), "gen_auto");

  // архив задеплоенного для Я.Диска — отдельно от tasks, "Очистить БД от
  // готовых" на главном экране его не трогает (см. deployed_archive)
  const deployedKeys = new Set((jiraUser ? getArchivedDeployedKeys(jiraUser) : []).map((k) => k.toUpperCase()));

  const days: YaDiskDay[] = lastNDateTags(7).map((date) => {
    const items: (YaDiskItem & { sortTs: number })[] = [];

    for (const name of listSubdirs(path.join(genAutoDir, `генератор_${date}`))) {
      const key = name.toUpperCase();
      if (!deployedKeys.has(key)) continue; // только реально задеплоенные задачи текущего jira-пользователя
      const dir = path.join(genAutoDir, `генератор_${date}`, name);
      items.push({
        name,
        domain: getArchivedDomain(key) ?? "",
        type: "generator",
        uploadedAt: readUploadedAt(dir, "generator"),
        sortTs: mtimeMs(dir),
      });
    }

    const manualDir = path.join(genAutoDir, `ручники_${date}`);
    for (const name of listSubdirs(manualDir)) {
      const dir = path.join(manualDir, name);
      const meta = readManualMeta(dir);
      items.push({
        name,
        domain: name,
        type: meta?.noTaskNumber ? "manual-archive" : "manual",
        taskNumber: meta?.taskNumber?.trim() || undefined,
        uploadedAt: readUploadedAt(dir, "manual"),
        sortTs: mtimeMs(dir),
      });

      // если при заливке на сервер был сделан бэкап старого содержимого — он
      // тоже отображается отдельной строкой, чтобы его можно было выбрать
      const oldZipPath = path.join(genAutoDir, "downloads", "manual-backups", `${name}.old.zip`);
      if (existsSync(oldZipPath)) {
        items.push({
          name,
          domain: name,
          type: "manual-backup",
          uploadedAt: readUploadedAt(dir, "manual-backup"),
          sortTs: mtimeMs(oldZipPath),
        });
      }
    }

    // последние задеплоенные/загруженные — первыми
    items.sort((a, b) => b.sortTs - a.sortTs);

    return { date, items: items.map(({ sortTs: _sortTs, ...item }) => item) };
  });

  return NextResponse.json({ days });
}
