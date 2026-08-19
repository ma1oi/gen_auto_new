import { existsSync, readFileSync } from "fs";
import path from "path";
import type { ManualMeta } from "@/app/api/pipeline/manual-upload/stage/route";

export function readTaskNumberDigits(dir: string): string {
  const metaPath = path.join(dir, ".manual-meta.json");
  if (!existsSync(metaPath)) return "";
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as ManualMeta;
    return (meta.taskNumber ?? "").replace(/\D+/g, "");
  } catch {
    return "";
  }
}

// имя архива/папки без расширения — используется и для одиночного скачивания
// (yadisk-upload/download), и для объединённого (download-selected). Номер
// задачи опционален и не дублируется, если он уже есть в самом имени.
export function archiveBaseName(localDir: string, name: string, type: string): string {
  const digits = type === "manual" ? readTaskNumberDigits(localDir) : "";
  return digits && !name.includes(digits) ? `${name}.${digits}` : name;
}
