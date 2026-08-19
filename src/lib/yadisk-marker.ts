import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export type YaDiskItemType = "generator" | "manual" | "manual-backup";

function markerPath(folderDir: string): string {
  return path.join(folderDir, ".yadisk-uploaded.json");
}

// .yadisk-uploaded.json — сайдкар в той же папке, что и сам ручник/задача
// генератора, отмечает какие типы (generator / manual / manual-backup) уже
// были залиты на Я.Диск и когда — читается списком, пишется после заливки.
export function readUploadedAt(folderDir: string, type: YaDiskItemType): string | undefined {
  const p = markerPath(folderDir);
  if (!existsSync(p)) return undefined;
  try {
    const data = JSON.parse(readFileSync(p, "utf-8")) as Record<string, string>;
    return data[type];
  } catch {
    return undefined;
  }
}

export function markUploaded(folderDir: string, type: YaDiskItemType): void {
  const p = markerPath(folderDir);
  let data: Record<string, string> = {};
  if (existsSync(p)) {
    try {
      data = JSON.parse(readFileSync(p, "utf-8")) as Record<string, string>;
    } catch {
      data = {};
    }
  }
  data[type] = new Date().toISOString();
  writeFileSync(p, JSON.stringify(data));
}
